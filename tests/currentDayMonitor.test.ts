import { mockAzureState, resetMockAzureState, useFixedClock } from './testUtil/azureMocks'

const mockAlertSlack = jest.fn()
jest.mock('../src/alertSlack', () => ({
    alertSlack: (message: string) => mockAlertSlack(message),
}))
jest.mock('@azure/storage-blob', () => jest.requireActual('./testUtil/azureMocks').fakeStorageBlobModule())
jest.mock('@azure/identity', () => jest.requireActual('./testUtil/azureMocks').fakeIdentityModule())

const loadMonitor = (): typeof import('../src/currentDayMonitor') => {
    let module: typeof import('../src/currentDayMonitor') | undefined
    jest.isolateModules(() => {
        module = require('../src/currentDayMonitor')
    })
    return module!
}

// Tests run with TZ=Europe/Helsinki, like the Docker image. 12:30 local time.
const NOW = new Date('2026-10-29T12:30:00+02:00')
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3600 * 1000)

const genericAlert =
    'Something bad happened. There seems to be an issue with monitoring HFP-data. Investigate and fix the problem.'
const lastModifiedAlert =
    'HFP sink might be down. Did not find any blob with lastModified within 4 hours. Investigate and fix the problem as soon as possible.'
const nameAlert =
    'Did not find any blob with name within 12 hours. Investigate and fix the problem as soon as possible.'

describe('Current day monitor', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            HFP_STORAGE_ACCOUNT_NAME: 'hfpaccount',
            HFP_STORAGE_CONTAINER_NAME: 'hfp-v2',
        }
        resetMockAzureState()
        mockAlertSlack.mockReset()
        useFixedClock(NOW)
        jest.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        process.env = originalEnv
        jest.useRealTimers()
        jest.restoreAllMocks()
    })

    test('queries blobs of the last four operating days with the default Azure credential', async () => {
        await loadMonitor().runCurrentDayMonitor()
        expect(mockAzureState.constructed).toStrictEqual([
            { accountUrl: 'https://hfpaccount.blob.core.windows.net', credential: { fake: 'DefaultAzureCredential' } },
        ])
        expect(mockAzureState.queries).toStrictEqual(["@container='hfp-v2' AND min_oday >= '2026-10-25'"])
    })

    test('a recent blob name and a recent lastModified do not alert', async () => {
        mockAzureState.blobsByQuery = () => [{ name: '2026-10-29T11-2.csv.zst' }]
        mockAzureState.lastModifiedByName.set('2026-10-29T11-2.csv.zst', hoursAgo(1))
        await loadMonitor().runCurrentDayMonitor()
        expect(mockAzureState.propertiesRequested).toStrictEqual([
            { container: 'hfp-v2', blobName: '2026-10-29T11-2.csv.zst' },
        ])
        expect(mockAlertSlack).not.toHaveBeenCalled()
    })

    test('a blob name from 11 hours ago still counts as recent', async () => {
        mockAzureState.blobsByQuery = () => [{ name: '2026-10-29T01-4.csv.zst' }]
        mockAzureState.lastModifiedByName.set('2026-10-29T01-4.csv.zst', hoursAgo(2))
        await loadMonitor().runCurrentDayMonitor()
        expect(mockAlertSlack).not.toHaveBeenCalled()
    })

    test('no blob modified within 4 hours alerts that the sink might be down', async () => {
        mockAzureState.blobsByQuery = () => [{ name: '2026-10-29T11-2.csv.zst' }]
        mockAzureState.lastModifiedByName.set('2026-10-29T11-2.csv.zst', hoursAgo(5))
        await loadMonitor().runCurrentDayMonitor()
        expect(mockAlertSlack).toHaveBeenCalledTimes(1)
        expect(mockAlertSlack).toHaveBeenCalledWith(lastModifiedAlert)
    })

    test('no blobs at all alerts that the sink might be down', async () => {
        await loadMonitor().runCurrentDayMonitor()
        expect(mockAlertSlack).toHaveBeenCalledWith(lastModifiedAlert)
    })

    test('a recently modified blob without a recent name alerts about the name', async () => {
        mockAzureState.blobsByQuery = () => [{ name: '2026-10-28T20-1.csv.zst' }]
        mockAzureState.lastModifiedByName.set('2026-10-28T20-1.csv.zst', hoursAgo(1))
        await loadMonitor().runCurrentDayMonitor()
        expect(mockAlertSlack).toHaveBeenCalledTimes(1)
        expect(mockAlertSlack).toHaveBeenCalledWith(nameAlert)
    })

    test('properties are read once per date-hour-segment and only until a recent blob is found', async () => {
        mockAzureState.blobsByQuery = () => [
            { name: '2026-10-29T09-1.csv.zst' },
            { name: '2026-10-29T09-1_b.csv.zst' },
            { name: '2026-10-29T10-3.csv.zst' },
            { name: '2026-10-29T11-1.csv.zst' },
        ]
        mockAzureState.lastModifiedByName.set('2026-10-29T09-1.csv.zst', hoursAgo(6))
        mockAzureState.lastModifiedByName.set('2026-10-29T10-3.csv.zst', hoursAgo(2))
        mockAzureState.lastModifiedByName.set('2026-10-29T11-1.csv.zst', hoursAgo(1))
        await loadMonitor().runCurrentDayMonitor()
        expect(mockAzureState.propertiesRequested.map((p) => p.blobName)).toStrictEqual([
            '2026-10-29T09-1.csv.zst',
            '2026-10-29T10-3.csv.zst',
        ])
        expect(mockAlertSlack).not.toHaveBeenCalled()
    })

    test('a storage error sends the generic alert', async () => {
        mockAzureState.findError = new Error('storage unavailable')
        await loadMonitor().runCurrentDayMonitor()
        expect(mockAlertSlack).toHaveBeenCalledWith(genericAlert)
    })

    test.each(['HFP_STORAGE_ACCOUNT_NAME', 'HFP_STORAGE_CONTAINER_NAME'])(
        'a missing %s sends the generic alert without querying storage',
        async (name) => {
            delete process.env[name]
            await loadMonitor().runCurrentDayMonitor()
            expect(mockAzureState.queries).toHaveLength(0)
            expect(mockAlertSlack).toHaveBeenCalledWith(genericAlert)
        },
    )
})

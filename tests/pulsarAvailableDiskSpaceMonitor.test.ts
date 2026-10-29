import { startTestServer, TestServer } from './testUtil/httpServer'

const mockAlertSlack = jest.fn()
jest.mock('../src/alertSlack', () => ({
    alertSlack: (message: string) => mockAlertSlack(message),
}))

const loadMonitor = (): typeof import('../src/pulsarAvailableDiskSpaceMonitor') => {
    let module: typeof import('../src/pulsarAvailableDiskSpaceMonitor') | undefined
    jest.isolateModules(() => {
        module = require('../src/pulsarAvailableDiskSpaceMonitor')
    })
    return module!
}

// The monitor waits 2.5 s between the three bookies.
jest.setTimeout(30_000)

describe('Pulsar available disk space monitor', () => {
    const originalEnv = process.env
    let bookies: TestServer
    let usedByBookie: Record<string, string>

    beforeEach(async () => {
        usedByBookie = { 'bookie-1': '50%', 'bookie-2': '50%', 'bookie-3': '50%' }
        // The monitor connects to localhost on the configured port and sends the
        // bookie IP only as the Host header.
        bookies = await startTestServer((req) => ({ status: 200, body: `${usedByBookie[req.headers.host ?? '']}\n` }))
        process.env = {
            ...originalEnv,
            HFP_MONITOR_PULSAR_BOOKIE_DISK_SPACE_PORT: String(bookies.port),
            HFP_MONITOR_PULSAR_BOOKIE_IP_1: 'bookie-1',
            HFP_MONITOR_PULSAR_BOOKIE_IP_2: 'bookie-2',
            HFP_MONITOR_PULSAR_BOOKIE_IP_3: 'bookie-3',
        }
        mockAlertSlack.mockReset()
        jest.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(async () => {
        process.env = originalEnv
        jest.restoreAllMocks()
        await bookies.close()
    })

    test('asks every bookie in order and does not alert when enough space is available', async () => {
        await loadMonitor().runAvailableDiskSpaceMonitor()
        expect(bookies.requests.map((r) => [r.method, r.url, r.headers.host])).toStrictEqual([
            ['GET', '/', 'bookie-1'],
            ['GET', '/', 'bookie-2'],
            ['GET', '/', 'bookie-3'],
        ])
        expect(mockAlertSlack).not.toHaveBeenCalled()
    })

    test('alerts for a bookie with less than 20 % available', async () => {
        usedByBookie['bookie-2'] = '81%'
        await loadMonitor().runAvailableDiskSpaceMonitor()
        expect(mockAlertSlack).toHaveBeenCalledTimes(1)
        expect(mockAlertSlack).toHaveBeenCalledWith(
            'Pulsar bookie (bookie-2) available disk space was: 19%, required available percentage is: 20%. Investigate this and fix as soon as possible.',
        )
    })

    test('exactly 20 % available does not alert', async () => {
        usedByBookie['bookie-3'] = '80%'
        await loadMonitor().runAvailableDiskSpaceMonitor()
        expect(mockAlertSlack).not.toHaveBeenCalled()
    })

    test('an unreachable bookie sends the generic alert', async () => {
        process.env.HFP_MONITOR_PULSAR_BOOKIE_DISK_SPACE_PORT = '1'
        await loadMonitor().runAvailableDiskSpaceMonitor()
        expect(mockAlertSlack).toHaveBeenCalledWith(
            'Something bad happened. There seems to be an issue with available disk space monitor. Investigate and fix the problem.',
        )
    })
})

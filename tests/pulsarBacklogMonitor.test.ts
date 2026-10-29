import { startTestServer, TestServer } from './testUtil/httpServer'

const mockAlertSlack = jest.fn()
jest.mock('../src/alertSlack', () => ({
    alertSlack: (message: string) => mockAlertSlack(message),
}))

const loadMonitor = (): typeof import('../src/pulsarBacklogMonitor') => {
    let module: typeof import('../src/pulsarBacklogMonitor') | undefined
    jest.isolateModules(() => {
        module = require('../src/pulsarBacklogMonitor')
    })
    return module!
}

const statsWithBacklog = (msgBacklog: unknown) =>
    JSON.stringify({ subscriptions: { transitlog_hfp_csv_sink: { msgBacklog } } })

describe('Pulsar backlog monitor', () => {
    const originalEnv = process.env
    let pulsarAdmin: TestServer
    let responseBody: string

    beforeEach(async () => {
        responseBody = statsWithBacklog(0)
        pulsarAdmin = await startTestServer(() => ({ status: 200, body: responseBody }))
        process.env = {
            ...originalEnv,
            HFP_MONITOR_PULSAR_PROXY_IP: '127.0.0.1',
            HFP_MONITOR_PULSAR_ADMIN_PORT: String(pulsarAdmin.port),
            HFP_MONITOR_TARGET_ENVIRONMENT: 'PRODUCTION',
        }
        mockAlertSlack.mockReset()
        jest.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(async () => {
        process.env = originalEnv
        jest.restoreAllMocks()
        await pulsarAdmin.close()
    })

    test.each([
        ['DEV', '/admin/v2/persistent/dev-transitdata/hfp/v2/stats'],
        ['STAGE', '/admin/v2/persistent/stage-transitdata/hfp/v2/stats'],
        ['PRODUCTION', '/admin/v2/persistent/prod-transitdata/hfp/v2/stats'],
        ['anything else', '/admin/v2/persistent/prod-transitdata/hfp/v2/stats'],
    ])('target environment %s reads %s', async (environment, path) => {
        process.env.HFP_MONITOR_TARGET_ENVIRONMENT = environment
        await loadMonitor().runPulsarBacklogMonitor()
        expect(pulsarAdmin.requests).toHaveLength(1)
        expect(pulsarAdmin.requests[0].method).toBe('GET')
        expect(pulsarAdmin.requests[0].url).toBe(path)
    })

    test.each([0, 1_000_000, 50_000_000])('a backlog of %d messages does not alert', async (backlog) => {
        responseBody = statsWithBacklog(backlog)
        await loadMonitor().runPulsarBacklogMonitor()
        expect(mockAlertSlack).not.toHaveBeenCalled()
    })

    test('a backlog above 50 million messages alerts with the rounded count', async () => {
        responseBody = statsWithBacklog(65_432_109)
        await loadMonitor().runPulsarBacklogMonitor()
        expect(mockAlertSlack).toHaveBeenCalledTimes(1)
        expect(mockAlertSlack.mock.calls[0][0]).toMatch(/^HFP-sink Pulsar backlog has ~65\.4 million messages \(/)
        expect(mockAlertSlack.mock.calls[0][0]).toContain('Warning: after passing this boundary, HFP-data starts to disappear.')
    })

    const genericAlert =
        'Something bad happened. There seems to be an issue with pulsar backlog message count. Investigate and fix the problem.'

    test('a missing subscription sends the generic alert', async () => {
        responseBody = JSON.stringify({ subscriptions: { other: { msgBacklog: 1 } } })
        await loadMonitor().runPulsarBacklogMonitor()
        expect(mockAlertSlack).toHaveBeenCalledWith(genericAlert)
    })

    test('a non-numeric backlog sends the generic alert', async () => {
        responseBody = statsWithBacklog('lots')
        await loadMonitor().runPulsarBacklogMonitor()
        expect(mockAlertSlack).toHaveBeenCalledWith(genericAlert)
    })

    test('an unreachable Pulsar admin sends the generic alert', async () => {
        await pulsarAdmin.close()
        pulsarAdmin = await startTestServer(() => ({ status: 200, body: '' }))
        process.env.HFP_MONITOR_PULSAR_ADMIN_PORT = '1'
        await loadMonitor().runPulsarBacklogMonitor()
        expect(mockAlertSlack).toHaveBeenCalledWith(genericAlert)
    })

    test.each(['HFP_MONITOR_PULSAR_PROXY_IP', 'HFP_MONITOR_PULSAR_ADMIN_PORT'])(
        'a missing %s sends the generic alert without calling Pulsar',
        async (name) => {
            delete process.env[name]
            await loadMonitor().runPulsarBacklogMonitor()
            expect(pulsarAdmin.requests).toHaveLength(0)
            expect(mockAlertSlack).toHaveBeenCalledWith(genericAlert)
        },
    )
})

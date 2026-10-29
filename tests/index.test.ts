const mockScheduled: { cron: string; job: () => void }[] = []
jest.mock('node-schedule', () => ({
    __esModule: true,
    default: {
        scheduleJob: (cron: string, job: () => void) => {
            mockScheduled.push({ cron, job })
            return { nextInvocation: () => new Date('2026-10-29T13:00:00Z') }
        },
    },
}))

const mockMonitors = {
    runCurrentDayMonitor: jest.fn(),
    runPreviousDayMonitor: jest.fn(),
    runPulsarBacklogMonitor: jest.fn(),
    runAvailableDiskSpaceMonitor: jest.fn(),
}
jest.mock('../src/currentDayMonitor', () => ({ runCurrentDayMonitor: mockMonitors.runCurrentDayMonitor }))
jest.mock('../src/previousDayMonitor', () => ({ runPreviousDayMonitor: mockMonitors.runPreviousDayMonitor }))
jest.mock('../src/pulsarBacklogMonitor', () => ({ runPulsarBacklogMonitor: mockMonitors.runPulsarBacklogMonitor }))
jest.mock('../src/pulsarAvailableDiskSpaceMonitor', () => ({
    runAvailableDiskSpaceMonitor: mockMonitors.runAvailableDiskSpaceMonitor,
}))

const loadIndex = () => {
    jest.isolateModules(() => {
        require('../src/index')
    })
}

describe('Scheduling', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            HFP_CURRENT_DAY_MONITOR_CRON: '*/50 * * * *',
            HFP_PREVIOUS_DAY_MONITOR_CRON: '0 6 * * *',
            PULSAR_BACKLOG_MONITOR_CRON: '0 */2 * * *',
            AVAILABLE_DISK_SPACE_MONITOR_CRON: '0 * * * *',
        }
        mockScheduled.length = 0
        jest.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        process.env = originalEnv
        jest.restoreAllMocks()
    })

    test('schedules the current day, previous day and backlog monitors but not the disk space monitor', () => {
        loadIndex()
        expect(mockScheduled.map((s) => s.cron)).toStrictEqual(['*/50 * * * *', '0 6 * * *', '0 */2 * * *'])
        expect(mockScheduled.map((s) => s.job)).toStrictEqual([
            mockMonitors.runCurrentDayMonitor,
            mockMonitors.runPreviousDayMonitor,
            mockMonitors.runPulsarBacklogMonitor,
        ])
    })

    test.each(['HFP_CURRENT_DAY_MONITOR_CRON', 'HFP_PREVIOUS_DAY_MONITOR_CRON', 'PULSAR_BACKLOG_MONITOR_CRON'])(
        'a missing %s stops the start-up',
        (name) => {
            delete process.env[name]
            expect(loadIndex).toThrow(`Secret ${name} is missing.`)
        },
    )
})

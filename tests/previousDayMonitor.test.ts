import {
  FakeBlob,
  mockAzureState,
  resetMockAzureState,
  useFixedClock,
} from './testUtil/azureMocks'

const mockAlertSlack = jest.fn()
jest.mock('../src/alertSlack', () => ({
  alertSlack: (message: string) => mockAlertSlack(message),
}))
jest.mock('@azure/storage-blob', () =>
  jest.requireActual('./testUtil/azureMocks').fakeStorageBlobModule()
)
jest.mock('@azure/identity', () =>
  jest.requireActual('./testUtil/azureMocks').fakeIdentityModule()
)

const loadMonitor = (): typeof import('../src/previousDayMonitor') => {
  let module: typeof import('../src/previousDayMonitor') | undefined
  jest.isolateModules(() => {
    module = require('../src/previousDayMonitor')
  })
  return module!
}

// Tests run with TZ=Europe/Helsinki, like the Docker image.
const NOW = new Date('2026-10-29T06:00:00+02:00')
const YESTERDAY = '2026-10-28'
const DAY_BEFORE_YESTERDAY = '2026-10-27'
const queryFor = (date: string) =>
  `@container='hfp-v2' AND min_oday <= '${date}' AND max_oday >= '${date}'`

const allSegments = (): string[] => {
  const segments: string[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    for (let segment = 1; segment <= 4; segment += 1) {
      segments.push(`${hour}-${segment}`)
    }
  }
  return segments
}

const blobFor = (date: string, segment: string): FakeBlob => {
  const [hour, part] = segment.split('-')
  return { name: `${date}T${hour.padStart(2, '0')}-${part}.csv.zst` }
}

const gapAlert = (ranges: string) =>
  `Found gap(s) in HFP data (${YESTERDAY}): [${ranges}]. Investigate and fix the problem as soon as possible.`

describe('Previous day monitor', () => {
  const originalEnv = process.env

  const serveYesterdayExcept = (missing: string[]) => {
    const present = allSegments().filter((segment) => !missing.includes(segment))
    const half = Math.floor(present.length / 2)
    mockAzureState.blobsByQuery = (query) => {
      if (query === queryFor(DAY_BEFORE_YESTERDAY)) {
        return present.slice(0, half).map((segment) => blobFor(YESTERDAY, segment))
      }
      if (query === queryFor(YESTERDAY)) {
        return present.slice(half).map((segment) => blobFor(YESTERDAY, segment))
      }
      return []
    }
  }

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

  test('queries the day before yesterday and yesterday', async () => {
    serveYesterdayExcept([])
    await loadMonitor().runPreviousDayMonitor()
    expect(mockAzureState.constructed[0]?.accountUrl).toBe(
      'https://hfpaccount.blob.core.windows.net'
    )
    expect(mockAzureState.queries).toStrictEqual([
      queryFor(DAY_BEFORE_YESTERDAY),
      queryFor(YESTERDAY),
    ])
  })

  test('all 96 quarter-hour blobs of yesterday do not alert', async () => {
    serveYesterdayExcept([])
    await loadMonitor().runPreviousDayMonitor()
    expect(mockAlertSlack).not.toHaveBeenCalled()
  })

  test('blobs of other days do not count', async () => {
    mockAzureState.blobsByQuery = () =>
      allSegments().map((segment) => blobFor(DAY_BEFORE_YESTERDAY, segment))
    await loadMonitor().runPreviousDayMonitor()
    expect(mockAlertSlack).toHaveBeenCalledWith(gapAlert('00:00 - 24:00'))
  })

  test.each([
    [['8-3'], '08:30 - 08:45'],
    [['0-1'], '00:00 - 00:15'],
    [['23-4'], '23:45 - 24:00'],
    [['5-4', '6-1'], '05:45 - 06:15'],
    [['0-1', '0-2', '5-4', '6-1', '10-2'], '00:00 - 00:30, 05:45 - 06:15, 10:15 - 10:30'],
    [['0-1', '0-3'], '00:00 - 00:15, 00:30 - 00:45'],
    [['12-1', '12-2', '12-3', '12-4', '13-1'], '12:00 - 13:15'],
  ])('missing %p alerts with ranges %s', async (missing, ranges) => {
    serveYesterdayExcept(missing)
    await loadMonitor().runPreviousDayMonitor()
    expect(mockAlertSlack).toHaveBeenCalledTimes(1)
    expect(mockAlertSlack).toHaveBeenCalledWith(gapAlert(ranges))
  })

  test('a storage error sends the generic alert', async () => {
    mockAzureState.findError = new Error('storage unavailable')
    await loadMonitor().runPreviousDayMonitor()
    expect(mockAlertSlack).toHaveBeenCalledWith(
      'Something bad happened. There seems to be an issue with monitoring HFP-data. Investigate and fix the problem.'
    )
  })
})

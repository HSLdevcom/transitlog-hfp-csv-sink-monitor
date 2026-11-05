import { startTestServer, TestServer } from './testUtil/httpServer'

const loadAlertSlack = (): typeof import('../src/alertSlack') => {
  let module: typeof import('../src/alertSlack') | undefined
  jest.isolateModules(() => {
    module = require('../src/alertSlack')
  })
  return module!
}

describe('alertSlack', () => {
  const originalEnv = process.env
  let slack: TestServer

  beforeEach(async () => {
    slack = await startTestServer(() => ({ status: 200, body: 'ok' }))
    process.env = {
      ...originalEnv,
      HFP_MONITOR_SLACK_WEBHOOK_URL: `http://127.0.0.1:${slack.port}/hook`,
      HFP_MONITOR_TARGET_ENVIRONMENT: 'DEV',
    }
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(async () => {
    process.env = originalEnv
    jest.restoreAllMocks()
    await slack.close()
  })

  test('posts a mrkdwn message mentioning every configured user', async () => {
    process.env.HFP_MONITOR_SLACK_USER_IDS = 'U111,U222'
    const { alertSlack } = loadAlertSlack()

    await alertSlack('Something happened.')

    expect(slack.requests).toHaveLength(1)
    expect(slack.requests[0].method).toBe('POST')
    expect(slack.requests[0].url).toBe('/hook')
    expect(slack.requests[0].headers['content-type']).toContain('application/json')
    expect(JSON.parse(slack.requests[0].body)).toStrictEqual({
      type: 'mrkdwn',
      text: 'Hey <@U111>, <@U222>,  [DEV] Something happened.',
    })
  })

  test('a single user is mentioned without a separator', async () => {
    process.env.HFP_MONITOR_SLACK_USER_IDS = 'U111'
    const { alertSlack } = loadAlertSlack()

    await alertSlack('Hello.')

    expect(JSON.parse(slack.requests[0].body).text).toBe('Hey <@U111>,  [DEV] Hello.')
  })

  // Pins current behaviour: an empty user list still produces an empty mention.
  test('an empty user list still mentions an empty user id', async () => {
    process.env.HFP_MONITOR_SLACK_USER_IDS = ''
    const { alertSlack } = loadAlertSlack()

    await alertSlack('Hello.')

    expect(JSON.parse(slack.requests[0].body).text).toBe('Hey <@>,  [DEV] Hello.')
  })

  test('a failing webhook rejects', async () => {
    await slack.close()
    slack = await startTestServer(() => ({ status: 500, body: 'error' }))
    process.env.HFP_MONITOR_SLACK_WEBHOOK_URL = `http://127.0.0.1:${slack.port}/hook`
    const { alertSlack } = loadAlertSlack()

    await expect(alertSlack('Hello.')).rejects.toThrow()
  })
})

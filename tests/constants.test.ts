const secretFiles: Record<string, string> = {}

jest.mock('fs-extra', () => ({
    __esModule: true,
    default: {
        existsSync: (path: string) =>
            path === '/run/secrets/'
                ? Object.keys(secretFiles).length > 0
                : Object.prototype.hasOwnProperty.call(secretFiles, path.replace('/run/secrets/', '')),
        readdirSync: () => Object.keys(secretFiles),
        readFileSync: (path: string) => secretFiles[path.replace('/run/secrets/', '')],
    },
}))

const loadConstants = (): typeof import('../src/constants') => {
    let module: typeof import('../src/constants') | undefined
    jest.isolateModules(() => {
        module = require('../src/constants')
    })
    return module!
}

describe('constants', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = { ...originalEnv }
        Object.keys(secretFiles).forEach((key) => delete secretFiles[key])
    })

    afterAll(() => {
        process.env = originalEnv
    })

    test('values come from environment variables', () => {
        process.env.HFP_CURRENT_DAY_MONITOR_CRON = '*/50 * * * *'
        process.env.HFP_STORAGE_ACCOUNT_NAME = 'account'
        process.env.HFP_MONITOR_PULSAR_ADMIN_PORT = '8080'
        const constants = loadConstants()
        expect(constants.HFP_CURRENT_DAY_MONITOR_CRON).toBe('*/50 * * * *')
        expect(constants.HFP_STORAGE_ACCOUNT_NAME).toBe('account')
        expect(constants.HFP_MONITOR_PULSAR_ADMIN_PORT).toBe('8080')
    })

    test('missing values default to an empty string', () => {
        delete process.env.HFP_STORAGE_CONTAINER_NAME
        delete process.env.HFP_MONITOR_SLACK_WEBHOOK_URL
        const constants = loadConstants()
        expect(constants.HFP_STORAGE_CONTAINER_NAME).toBe('')
        expect(constants.HFP_MONITOR_SLACK_WEBHOOK_URL).toBe('')
    })

    test('a file in /run/secrets overrides the environment variable of the same name', () => {
        process.env.HFP_MONITOR_SLACK_WEBHOOK_URL = 'from-env'
        secretFiles.HFP_MONITOR_SLACK_WEBHOOK_URL = '  from-secret-file \n'
        const constants = loadConstants()
        expect(constants.HFP_MONITOR_SLACK_WEBHOOK_URL).toBe('from-secret-file')
    })

    test('the secret file with the highest version suffix wins', () => {
        process.env.HFP_STORAGE_CONTAINER_NAME = 'from-env'
        secretFiles.HFP_STORAGE_CONTAINER_NAME_1 = 'version-1'
        secretFiles.HFP_STORAGE_CONTAINER_NAME_3 = 'version-3'
        secretFiles.HFP_STORAGE_CONTAINER_NAME_2 = 'version-2'
        const constants = loadConstants()
        expect(constants.HFP_STORAGE_CONTAINER_NAME).toBe('version-3')
    })

    test('a secret file only applies to environment variables that are set', () => {
        delete process.env.HFP_STORAGE_ACCOUNT_NAME
        secretFiles.HFP_STORAGE_ACCOUNT_NAME = 'from-secret-file'
        const constants = loadConstants()
        expect(constants.HFP_STORAGE_ACCOUNT_NAME).toBe('')
    })
})

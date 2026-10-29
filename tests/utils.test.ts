import { ensureSecretExists } from '../src/utils'

describe('ensureSecretExists', () => {
    test.each(['value', '0', ' '])('accepts %p', (value) => {
        expect(() => ensureSecretExists(value, 'NAME')).not.toThrow()
    })

    test.each(['', undefined, null])('rejects %p', (value) => {
        expect(() => ensureSecretExists(value, 'NAME')).toThrow('Secret NAME is missing.')
    })
})

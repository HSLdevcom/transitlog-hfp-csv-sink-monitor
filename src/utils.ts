
export function ensureSecretExists(secretValue: unknown, secretName: string) {
    if (!secretValue) {
        throw new Error(`Secret ${secretName} is missing.`)
    }
}
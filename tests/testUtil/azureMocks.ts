/**
 * State shared between the jest.mock factories of @azure/storage-blob and
 * @azure/identity and the tests. The factories run inside isolated module
 * registries, so the tests talk to the fakes only through this object.
 */
export interface FakeBlob {
  name: string
  lastModified?: Date
}

interface MockAzureState {
  constructed: { accountUrl: string; credential: unknown }[]
  queries: string[]
  blobsByQuery: (query: string) => FakeBlob[]
  propertiesRequested: { container: string; blobName: string }[]
  lastModifiedByName: Map<string, Date>
  findError: Error | undefined
}

// Kept on globalThis because jest.isolateModules loads a fresh copy of this
// module for the mock factories; all copies must share one state.
const globalWithState = globalThis as typeof globalThis & { __mockAzureState?: MockAzureState }
globalWithState.__mockAzureState ??= {
  constructed: [],
  queries: [],
  blobsByQuery: () => [],
  propertiesRequested: [],
  lastModifiedByName: new Map(),
  findError: undefined,
}
export const mockAzureState: MockAzureState = globalWithState.__mockAzureState

export const resetMockAzureState = () => {
  mockAzureState.constructed = []
  mockAzureState.queries = []
  mockAzureState.blobsByQuery = () => []
  mockAzureState.propertiesRequested = []
  mockAzureState.lastModifiedByName = new Map()
  mockAzureState.findError = undefined
}

export const fakeStorageBlobModule = () => ({
  BlobServiceClient: function BlobServiceClient(accountUrl: string, credential: unknown) {
    mockAzureState.constructed.push({ accountUrl, credential })
    return {
      findBlobsByTags: (query: string) => {
        mockAzureState.queries.push(query)
        if (mockAzureState.findError) {
          throw mockAzureState.findError
        }
        const blobs = mockAzureState.blobsByQuery(query)
        return (async function* iterate() {
          for (const blob of blobs) {
            yield { name: blob.name }
          }
        })()
      },
      getContainerClient: (container: string) => ({
        getBlobClient: (blobName: string) => ({
          getProperties: async () => {
            mockAzureState.propertiesRequested.push({ container, blobName })
            return { lastModified: mockAzureState.lastModifiedByName.get(blobName) }
          },
        }),
      }),
    }
  },
})

export const fakeIdentityModule = () => ({
  DefaultAzureCredential: function DefaultAzureCredential() {
    return { fake: 'DefaultAzureCredential' }
  },
})

/** Fake only Date so that async iteration and real timers keep working. */
export const useFixedClock = (now: Date) => {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  })
}

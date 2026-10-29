import http from 'http'
import type { AddressInfo, Socket } from 'net'

export interface ReceivedRequest {
  method: string | undefined
  url: string | undefined
  headers: http.IncomingHttpHeaders
  body: string
}

export interface TestServer {
  port: number
  requests: ReceivedRequest[]
  close: () => Promise<void>
}

type Responder = (req: ReceivedRequest) => { status: number; body: string }

/**
 * Start a local HTTP server on a random port that records every request and
 * answers with the given responder.
 */
export async function startTestServer(respond: Responder): Promise<TestServer> {
  const requests: ReceivedRequest[] = []
  const sockets = new Set<Socket>()
  const server = http.createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
    })
    req.on('end', () => {
      const received = { method: req.method, url: req.url, headers: req.headers, body }
      requests.push(received)
      const { status, body: responseBody } = respond(received)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(responseBody)
    })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    port,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        sockets.forEach((socket) => socket.destroy())
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}

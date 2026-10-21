import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'
import { handleTavusRequest } from './src/components/cvi/lib/tavus-api-vite-ssr.ts'

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function tavusApi(): Plugin {
  const handle: Connect.NextHandleFunction = async (req, res, next) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/api/tavus')) {
      next()
      return
    }
    try {
      const body = await readBody(req)
      const request = new Request('http://localhost/api/tavus', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      const response = await handleTavusRequest(request)
      res.statusCode = response.status
      response.headers.forEach((value: string, key: string) => res.setHeader(key, value))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      res.statusCode = 500
      res.end('The lesson server could not start the call.')
    }
  }

  return {
    name: 'tavus-api',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

export default defineConfig({
  plugins: [react(), tavusApi()],
  // School Chromebooks are on Chrome 103. chrome96 keeps the bundle runnable there.
  build: { target: ['chrome96', 'safari15', 'firefox100'] },
  server: { port: 5175, strictPort: true },
})

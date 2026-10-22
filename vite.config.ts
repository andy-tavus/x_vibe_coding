import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { handleLessonHttp } from './api/lesson-control.ts'
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
    const path = req.url?.split('?')[0]
    if (path === '/api/lesson' && (req.method === 'GET' || req.method === 'POST')) {
      try {
        const body = req.method === 'POST' ? await readBody(req) : undefined
        const request = new Request('http://localhost/api/lesson', {
          method: req.method,
          headers: { 'content-type': 'application/json' },
          body,
        })
        const response = await handleLessonHttp(request)
        res.statusCode = response.status
        response.headers.forEach((value: string, key: string) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch {
        res.statusCode = 500
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify({ error: 'The lesson switch did not save.' }))
      }
      return
    }
    if (req.method !== 'POST' || path !== '/api/tavus') {
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
      const env = loadEnv(server.config.mode, server.config.envDir, '')
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value
      }
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      const env = loadEnv(server.config.mode, server.config.envDir, '')
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value
      }
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

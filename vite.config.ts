import { manusGameTuning } from './scripts/manus-tuning/vite.mjs'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { createReadStream, existsSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

/** Serve approved runtime assets in development without copying them into the production bundle. */
function runtimeAssets() {
  const root = resolve(process.cwd(), 'assets')
  const types: Record<string, string> = { '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.png': 'image/png' }
  return {
    name: 'apex-runtime-assets',
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/assets/')) return next()
        const file = resolve(root, decodeURIComponent(req.url.slice(8).split('?')[0]))
        if (!file.startsWith(root + sep) || !existsSync(file)) return next()
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(file).pipe(res)
      })
    },
  }
}

// Relative base keeps production output portable; the Session owns preview HOST/PORT.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT'])
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: './',
    plugins: [manusGameTuning(), runtimeAssets()],
    server: {
      host: env.HOST ?? '127.0.0.1', port, strictPort: true,
      proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8787', changeOrigin: false } },
      allowedHosts: ['.manuspre.computer', '.manus.computer', '.manus-asia.computer', '.manuscomputer.ai', '.manusvm.computer', 'localhost', '127.0.0.1'],
    },
    build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
    test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
  }
})

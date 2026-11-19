import { createServer } from 'node:http'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize, relative } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = process.env.PORT || 3000
// Set VITE_API_PROXY_TARGET to override the local backend.
const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000'
const DIST_DIR = join(__dirname, 'dist')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function serveFile(res, filePath) {
  const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
  const isHtml = extname(filePath).toLowerCase() === '.html'
  res.writeHead(200, {
    'Content-Type': contentType,
    // Always revalidate the SPA entry point so a new deployment cannot keep
    // loading an older hashed JavaScript bundle from the browser cache.
    'Cache-Control': isHtml ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
  })
  res.end(readFileSync(filePath))
}

// Create a proxy middleware for API calls
const apiProxy = createProxyMiddleware({
  target: API_PROXY_TARGET,
  changeOrigin: true,
  pathRewrite: {
    '^/api/': '/api/',
  },
})

// Create HTTP server
const server = createServer((req, res) => {
  // Handle API requests
  if (req.url.startsWith('/api/')) {
    apiProxy(req, res)
    return
  }

  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const requestedPath = normalize(join(DIST_DIR, pathname))
    const isInsideDist = relative(DIST_DIR, requestedPath).split(/[\\/]/)[0] !== '..'

    if (isInsideDist && existsSync(requestedPath) && statSync(requestedPath).isFile()) {
      serveFile(res, requestedPath)
      return
    }

    // SPA fallback for client-side routes.
    serveFile(res, join(DIST_DIR, 'index.html'))
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server listening on ${PORT}`)
  console.log(`Proxying API requests to: ${API_PROXY_TARGET}`)
})

server.on('error', (error) => {
  console.error('Server error:', error)
  process.exit(1)
})

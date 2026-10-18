// Serve the static practice-mode build (web/out) under /thread-pcc, as GitHub Pages does. Used by the e2e tests.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = new URL('../web/out/', import.meta.url).pathname
const base = '/thread-pcc'
const port = Number(process.env.PORT ?? 3011)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon' }

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith(base)) return res.writeHead(302, { location: `${base}/` }).end()
  let file = normalize(join(root, decodeURIComponent(url.pathname.slice(base.length))))
  if (!file.startsWith(root)) return res.writeHead(403).end()
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) return res.writeHead(404).end('not found')
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`static build on http://127.0.0.1:${port}${base}/`))

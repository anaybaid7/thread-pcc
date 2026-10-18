import type { NextConfig } from 'next'

// Two builds from one codebase:
//   live   (default)  pages call the THREAD API; /api is proxied to the server (THREAD_API_ORIGIN, default :8000).
//   static            NEXT_PUBLIC_DATA_MODE=static exports plain files for GitHub Pages. The same scenario engine runs
//                     in the browser in practice mode: nothing is saved, and AI drafting is off.
const isStatic = process.env.NEXT_PUBLIC_DATA_MODE === 'static'
const basePath = process.env.PAGES_BASE_PATH ?? ''
const apiOrigin = process.env.THREAD_API_ORIGIN ?? 'http://127.0.0.1:8000'

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@thread/engine'],
  ...(isStatic
    ? { output: 'export', basePath, trailingSlash: true, images: { unoptimized: true } }
    : { rewrites: async () => [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }] }),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default config

import type { NextConfig } from 'next'

// Two builds from one codebase:
//   live   (default)  pages call the FastAPI service; /api is proxied to :8000 in development.
//   static            NEXT_PUBLIC_DATA_MODE=static exports plain files for GitHub Pages and reads
//                     the engine snapshot in public/snapshot instead of the API.
const isStatic = process.env.NEXT_PUBLIC_DATA_MODE === 'static'
const basePath = process.env.PAGES_BASE_PATH ?? ''
const apiOrigin = process.env.THREAD_API_ORIGIN ?? 'http://127.0.0.1:8000'

const config: NextConfig = {
  reactStrictMode: true,
  ...(isStatic
    ? { output: 'export', basePath, trailingSlash: true, images: { unoptimized: true } }
    : { rewrites: async () => [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }] }),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default config

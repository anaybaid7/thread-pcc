import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Load the repo-root .env if present. Real environment variables always win. */
export function loadEnv(path = resolve(ROOT, '.env')) {
  if (existsSync(path)) process.loadEnvFile(path)
}

function int(env: NodeJS.ProcessEnv, name: string, fallback: number) {
  const v = Number(env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export type SslMode = 'disable' | 'require' | 'verify-full'

export interface Config {
  port: number
  host: string
  database:
    | { kind: 'postgres'; url: string; ssl: SslMode; ca?: string; poolMax?: number }
    | { kind: 'pglite'; dir: string | null }
  gemini: {
    apiKey: string | null
    model: string
    fallbackModel: string | null
    timeoutMs: number
    maxDraftsPerAttempt: number
    maxRequestsPerHour: number
  }
}

function readCa(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.includes('BEGIN CERTIFICATE')) return value
  return readFileSync(resolve(ROOT, value), 'utf8')
}

export function readConfig(env = process.env): Config {
  const url = env.DATABASE_URL?.trim()
  let database: Config['database']
  if (url) {
    const host = new URL(url).hostname
    const local = ['localhost', '127.0.0.1', '::1'].includes(host)
    const ca = readCa(env.DATABASE_CA_CERT)
    const ssl = (env.DATABASE_SSL as SslMode | undefined) ?? (ca ? 'verify-full' : local ? 'disable' : 'require')
    database = { kind: 'postgres', url, ssl, ca, poolMax: int(env, 'DATABASE_POOL_MAX', 5) }
  } else {
    database = { kind: 'pglite', dir: env.PGLITE_DIR === 'memory' ? null : resolve(ROOT, env.PGLITE_DIR ?? '.data/pglite') }
  }
  return {
    port: int(env, 'PORT', 8000),
    host: env.HOST ?? '127.0.0.1',
    database,
    gemini: {
      apiKey: env.GEMINI_API_KEY?.trim() || null,
      model: env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
      fallbackModel: env.GEMINI_FALLBACK_MODEL === 'none' ? null : env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.6-flash',
      timeoutMs: int(env, 'GEMINI_TIMEOUT_MS', 20_000),
      maxDraftsPerAttempt: int(env, 'GEMINI_MAX_DRAFTS_PER_ATTEMPT', 3),
      maxRequestsPerHour: int(env, 'GEMINI_MAX_REQUESTS_PER_HOUR', 60),
    },
  }
}

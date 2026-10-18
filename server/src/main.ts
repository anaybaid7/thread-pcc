import { buildApp } from './app'
import { loadEnv, readConfig } from './config'
import { openDb } from './db'
import { GeminiDrafter } from './gemini'

loadEnv()
const cfg = readConfig()
const db = await openDb(cfg.database)
const app = buildApp({ db, gemini: new GeminiDrafter(cfg.gemini), logger: true })

await app.listen({ port: cfg.port, host: cfg.host })
app.log.info(
  { database: db.info, gemini: { configured: !!cfg.gemini.apiKey, model: cfg.gemini.model } },
  'THREAD API ready',
)

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    await app.close()
    await db.close()
    process.exit(0)
  })

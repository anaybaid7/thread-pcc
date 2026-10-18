import { loadEnv, readConfig } from './config'
import { describeError, isConnectionError, openDb } from './db'
import { migrate } from './migrate'

/** npm run migrate: apply database migrations. The ward itself is seeded in code and replayed per workspace. */
loadEnv()
const db = await openDb(readConfig().database)
try {
  const applied = await migrate(db)
  console.log(`[${db.info.provider} ${db.info.target}] migrations applied: ${applied.length ? applied.join(', ') : 'none (up to date)'}`)
} catch (e) {
  // Connection errors are described without echoing the connection string; other errors are SQL or seed messages.
  console.error(`failed: ${isConnectionError(e) ? describeError(e) : (e as Error).message}`)
  process.exitCode = 1
} finally {
  await db.close()
}

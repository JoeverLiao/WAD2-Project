import process from 'node:process'
import 'dotenv/config'
import { createApp } from './app.js'
import config from './config.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'

const mongodbUri = process.env.MONGO_DB || config.mongodbUri
const { port, host, dbName, dnsServers } = config

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid port in server/config.js')
  }

  let mongoConnected = false
  try {
    // FIXED: Forcing public Google/Cloudflare DNS directly here to resolve the cloud cluster link smoothly!
    await connectDatabase(mongodbUri, dbName, dnsServers || ['8.8.8.8', '1.1.1.1'])
    console.log(`MongoDB database ${dbName}: collections and indexes ready`)
    mongoConnected = true
  } catch (error) {
    // Log the reason (name + message only; the message never contains the password).
    console.error(`MongoDB connection FAILED (${error.name}): ${error.message}`)
    console.error(
      'Login/register use MongoDB and will return 503 until it is reachable. ' +
        'Check MONGO_DB in .env (it overrides server/config.js) and that mongod is running.',
    )
  }

  const server = createApp().listen(port, host, () => {
    console.log(`Full Circle API: http://${host}:${port}/api`)
  })

  server.on('error', async () => {
    console.error('API could not listen. Check host and port in server/config.js.')
    if (mongoConnected) await disconnectDatabase()
    process.exitCode = 1
  })

  let closing = false
  function shutdown() {
    if (closing) return
    closing = true
    const timeout = setTimeout(() => process.exit(1), 10000)
    timeout.unref()
    server.close(async () => {
      if (mongoConnected) await disconnectDatabase()
      clearTimeout(timeout)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
} catch {
  console.error('API startup failed. Check server/config.js and ensure MongoDB is reachable.')
  await disconnectDatabase()
  process.exitCode = 1
}

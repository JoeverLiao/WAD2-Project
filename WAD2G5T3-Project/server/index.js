import process from 'node:process'
import { createApp } from './app.js'
import config from './config.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'

const { port, host, mongodbUri, dbName, dnsServers } = config

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid port in server/config.js')
  }
  await connectDatabase(mongodbUri, dbName, dnsServers)
  console.log(`MongoDB database ${dbName}: collections and indexes ready`)
  const server = createApp().listen(port, host, () => {
    console.log(`Full Circle API: http://${host}:${port}/api`)
  })

  server.on('error', async () => {
    console.error('API could not listen. Check host and port in server/config.js.')
    await disconnectDatabase()
    process.exitCode = 1
  })

  let closing = false
  function shutdown() {
    if (closing) return
    closing = true
    const timeout = setTimeout(() => process.exit(1), 10000)
    timeout.unref()
    server.close(async () => {
      await disconnectDatabase()
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

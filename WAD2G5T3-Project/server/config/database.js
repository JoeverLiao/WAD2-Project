import mongoose from 'mongoose'
import dns from 'node:dns'
import { databaseModels } from '../models/index.js'

// Strict handling: Fail promptly instead of queueing model operations without a database.
mongoose.set('bufferCommands', false)

// RESTORED THE FUNCTION EXPORT:
export async function connectDatabase(uri, dbName, dnsServers = []) {
  if (!uri) throw new Error('mongodbUri is required in server/config.js.')
  if (!dbName) throw new Error('dbName is required in server/config.js.')
  if (dnsServers && dnsServers.length) dns.setServers(dnsServers)
  
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 5000,
    autoCreate: false,
    autoIndex: false,
  })
  await initializeCollections()
}

export async function initializeCollections() {
  for (const model of databaseModels) {
    // Safe to repeat: create missing collections and declared indexes, preserving data.
    await model.createCollection()
    await model.createIndexes()
  }
}

export async function checkDatabase() {
  if (mongoose.connection.readyState !== 1) throw new Error('Database is disconnected')
  await mongoose.connection.db.admin().ping()
}

export async function disconnectDatabase() {
  await mongoose.disconnect()
}

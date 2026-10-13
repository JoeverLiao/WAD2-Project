// One-off: copy accounts from data/credentials.json (old JSON auth) into MongoDB.
// Run from the project folder:  node scripts/migrate-json-users.js
// Uses the native driver on purpose: User.save() would run the pre-save hook and bcrypt the
// existing hash a second time, which would make the old password stop working.
// Safe to repeat: existing emails are left untouched. Never prints hashes.
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import config from '../server/config.js'
import User from '../server/models/User.js'
import { connectDatabase, disconnectDatabase } from '../server/config/database.js'

const users = JSON.parse(await readFile(new URL('../data/credentials.json', import.meta.url), 'utf8'))
await connectDatabase(process.env.MONGO_DB || config.mongodbUri, config.dbName, config.dnsServers)
for (const u of users) {
  const email = u.email.toLowerCase().trim()
  const result = await User.collection.updateOne(
    { email },
    {
      $setOnInsert: {
        name: u.username,
        email,
        password: u.password, // already a bcrypt hash
        loginStatus: false,
        lastLogin: null,
        createdAt: new Date(u.createdAt),
        updatedAt: new Date(u.updatedAt),
      },
    },
    { upsert: true },
  )
  console.log(`${email}: ${result.upsertedCount ? 'migrated' : 'already in MongoDB, skipped'}`)
}
await disconnectDatabase()
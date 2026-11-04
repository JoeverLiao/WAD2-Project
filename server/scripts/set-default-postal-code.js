// One-off: give every existing user without a preferred location the default postal code
// (SMU, 178902). New users enter their own when they register.
// Run from the server folder:  node scripts/set-default-postal-code.js
// Safe to repeat: users who already have a postal code are left untouched.
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import User from '../models/userModel.js'

const DEFAULT_POSTAL_CODE = '178902'

dotenv.config({ path: fileURLToPath(new URL('../config.env', import.meta.url)), quiet: true })

if (!process.env.DB) {
  console.error('DB is not set in server/config.env')
  process.exit(1)
}

await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 10000 })
try {
  const result = await User.updateMany(
    { $or: [{ postalCode: { $exists: false } }, { postalCode: null }, { postalCode: '' }] },
    { $set: { postalCode: DEFAULT_POSTAL_CODE } },
  )
  const total = await User.countDocuments()
  console.log(
    `Set postal code ${DEFAULT_POSTAL_CODE} on ${result.modifiedCount} of ${total} users.`,
  )
} finally {
  await mongoose.disconnect()
}

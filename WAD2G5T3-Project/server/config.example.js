// Copy to config.js. config.js is ignored by Git.
// Environment variables (.env at project root) override these values:
//   MONGO_DB      — MongoDB connection string
//   JWT_SECRET    — secret key for signing tokens
//   JWT_EXPIRES_IN — token expiry duration (default 7d)
export default {
  mongodbUri: 'mongodb://[IP_ADDRESS]:27017/',
  dbName: 'full_circle',
  dnsServers: [],
  port: 3000,
  host: 'localhost',
}

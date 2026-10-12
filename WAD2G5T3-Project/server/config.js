// Backend settings. Keep database credentials out of commits and frontend code.
export default {
  mongodbUri: 'mongodb+srv://testUser:EbELArvdMQpTtLXt@joevancluster.t33e5ch.mongodb.net/',
  dbName: 'full_circle',
  // Node's local DNS resolver refuses Atlas SRV lookups on this machine.
  dnsServers: ['1.1.1.1', '8.8.8.8'],
  port: 3000,
  host: '127.0.0.1',
}

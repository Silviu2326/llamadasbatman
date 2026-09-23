// Authentication-only database check. Reads no contacts, scripts or recordings.
const { prisma } = require('/opt/vendrava/gateway/dist/lib/prisma')
prisma.$connect().then(() => console.log('Database connection from VPS: OK'))
  .catch(() => { console.error('Database connection from VPS: FAILED'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

// Readiness check on loopback only. No DB, voice provider or phone requests.
const { createConnection } = require('node:net')
const socket = createConnection({ host: '127.0.0.1', port: 5038 })
let pending = '', done = false
const timer = setTimeout(() => finish(false), 5000)
function finish(ok) {
  if (done) return
  done = true; clearTimeout(timer); socket.destroy()
  console.log('AMI authentication: ' + (ok ? 'OK' : 'FAILED'))
  if (!ok) process.exitCode = 1
}
socket.on('error', () => finish(false))
socket.on('connect', () => socket.write('Action: Login\r\nActionID: verify\r\nUsername: ' + process.env.ZADARMA_AMI_USER + '\r\nSecret: ' + process.env.ZADARMA_AMI_SECRET + '\r\nEvents: off\r\n\r\n'))
socket.on('data', data => {
  pending += data.toString()
  if (pending.includes('Response: Success')) finish(true)
  else if (pending.includes('Response: Error')) finish(false)
})

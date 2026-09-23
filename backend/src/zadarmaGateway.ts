import { loadZadarmaGatewayConfig } from './voice/telephony/zadarma/config'

async function main() {
  const config = loadZadarmaGatewayConfig()
  const { startZadarmaGateway } = await import('./voice/telephony/zadarma/gateway')
  const gateway = await startZadarmaGateway(config)
  console.info('[ZADARMA] Gateway listening on loopback; no SIP credentials are changed by this process.')
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await gateway.close()
    const { prisma } = await import('./lib/prisma')
    await prisma.$disconnect()
    process.exit(0)
  }
  process.once('SIGINT', () => { void stop() })
  process.once('SIGTERM', () => { void stop() })
}
main().catch(error => { console.error('[ZADARMA]', error.message); process.exitCode = 1 })

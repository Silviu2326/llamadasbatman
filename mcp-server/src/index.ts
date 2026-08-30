import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { loadConfig } from './config.js'
import { CallsRobinClient, CallsRobinApiError } from './callsrobin-client.js'
import { registerReadOnlyTools } from './tools.js'
import { registerExtendedReadOnlyTools } from './extended-tools.js'
import { registerWriteTools } from './write-tools.js'
import { registerIntelligentReadTools, registerIntelligentWriteTools } from './intelligent-tools.js'

function createServer() {
  const config = loadConfig()
  const server = new McpServer({
    name: 'llamadasrobin-mcp',
    version: '0.1.0',
    title: 'LlamadasRobin MCP',
    description: 'Consulta LlamadasRobin y, si se activa explícitamente, ejecuta operaciones CRM protegidas.',
  })

  const api = new CallsRobinClient(config)
  registerReadOnlyTools(server, api)
  registerExtendedReadOnlyTools(server, api)
  registerIntelligentReadTools(server, api)
  if (config.writeEnabled && config.writeApiKey) {
    const writeApi = new CallsRobinClient(config, fetch, config.writeApiKey)
    registerWriteTools(server, writeApi)
    registerIntelligentWriteTools(server, writeApi)
  }
  return server
}

try {
  await serveStdio(createServer)
  const writeMode = process.env.CALLSROBIN_WRITE_ENABLED?.trim().toLowerCase() === 'true'
  console.error(`llamadasrobin-mcp ejecutándose por stdio (${writeMode ? 'lectura y escritura protegida' : 'solo lectura'})`)
} catch (error) {
  if (error instanceof CallsRobinApiError) {
    console.error(`[llamadasrobin-mcp] ${error.code}: ${error.message}`)
  } else {
    console.error('[llamadasrobin-mcp] No se pudo iniciar:', error instanceof Error ? error.message : error)
  }
  process.exitCode = 1
}

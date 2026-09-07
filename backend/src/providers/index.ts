// Punto único de arranque de la plataforma de proveedores: importa los
// adapters (que se auto-registran), registra los contratos de capability, los
// ejecutores genéricos y el ejecutor de microapps. Lo llaman la API y el
// worker en su arranque; es idempotente de punta a punta.
import './adapters/deepseek'
import './adapters/openaiChat'
import './adapters/openaiImage'
import './adapters/voice'
import './adapters/brave'
import './adapters/magnific'
import './adapters/runway'
import './adapters/legacyCatalog'
import '../microapps/apps'
import { registerCapabilityExecutors } from './executors'
import { registerMicroappExecutor } from '../microapps/runtime'
import { registerStudioPostExecutor } from '../services/studioPost.service'
import { registerMarketplaceExecutor } from '../services/marketplace.service'
import { registerWebsiteIntakeExecutor } from '../services/websiteIntake.service'
import { registerGitProposalExecutor } from '../services/gitConnector.service'

let started = false

export function ensureProvidersRegistered(): void {
  if (started) return
  started = true
  registerCapabilityExecutors()
  registerMicroappExecutor()
  registerStudioPostExecutor()
  registerMarketplaceExecutor()
  registerWebsiteIntakeExecutor()
  registerGitProposalExecutor()
}

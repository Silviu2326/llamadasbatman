// Resolución de credencial por proveedor para el router y los ejecutores.
//
// Cadena (03-PROVEEDORES §4): BYOK de la org primero, clave global de
// Vendrava después. El secreto resuelto viaja en ProviderCtx y nunca se
// re-expone. billingMode es lo que separa contablemente BYOK de gestionado.
import type { BillingMode } from './types'

export interface ResolvedProviderCredential {
  secret: Record<string, string> | null
  billingMode: BillingMode
  scope: 'organization' | 'environment_override' | 'global'
}

// Claves globales por proveedor: si la env existe, Vendrava puede ejecutar en
// modo gestionado. Los adapters que resuelven su clave internamente (legacy)
// declaran aquí la env que usan para que el router sepa que hay camino.
const GLOBAL_ENV_BY_PROVIDER: Record<string, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  'openai-image': 'OPENAI_API_KEY',
  elevenlabs: 'ELEVENLABS_API_KEY',
  chatterbox: 'CHATTERBOX_URL',
  brave: 'BRAVE_SEARCH_API_KEY',
  magnific: 'MAGNIFIC_API_KEY',
  runway: 'RUNWAYML_API_SECRET',
}

// Proveedores cuyo BYOK vive en OrganizationIntegrationCredential. La lectura
// es perezosa (import dinámico) para no crear ciclos con los servicios.
export async function resolveProviderCredential(
  orgId: string,
  providerId: string,
): Promise<ResolvedProviderCredential | null> {
  try {
    const { getDecryptedOrganizationCredential } = await import('../services/organizationCredentials.service')
    if (typeof getDecryptedOrganizationCredential === 'function') {
      const cred = await getDecryptedOrganizationCredential(orgId, providerId)
      if (cred) return { secret: cred, billingMode: 'byok', scope: 'organization' }
    }
  } catch {
    // El servicio puede no soportar aún este proveedor: se cae al global.
  }

  const envKey = GLOBAL_ENV_BY_PROVIDER[providerId]
  if (envKey && process.env[envKey]?.trim()) {
    // secret null: los adapters legacy leen su clave global de la env
    // directamente. El dato importante para el router es que hay camino y que
    // el coste corre a cuenta de Vendrava.
    return { secret: null, billingMode: 'managed', scope: 'global' }
  }
  return null
}

// Registro en memoria de proveedores y contratos de capability.
//
// Los adapters se registran al importarse (igual que los módulos de
// src/jobs/). La lista de proveedores BYOK del centro de conexiones y el
// router leen de aquí; nadie más mantiene listas paralelas de proveedores.
import type { CapabilityBinding, CapabilityContract, ProviderDescriptor } from './types'

const providers = new Map<string, ProviderDescriptor>()
const contracts = new Map<string, CapabilityContract>()

export function registerProvider(descriptor: ProviderDescriptor): void {
  if (providers.has(descriptor.id)) {
    throw new Error(`Proveedor duplicado en el registro: ${descriptor.id}`)
  }
  providers.set(descriptor.id, descriptor)
}

export function registerCapabilityContract(contract: CapabilityContract): void {
  if (contracts.has(contract.capability)) {
    throw new Error(`Contrato duplicado de capability: ${contract.capability}`)
  }
  contracts.set(contract.capability, contract)
}

export function getProvider(id: string): ProviderDescriptor | undefined {
  return providers.get(id)
}

export function listProviders(): ProviderDescriptor[] {
  return [...providers.values()]
}

export function getCapabilityContract(capability: string): CapabilityContract | undefined {
  return contracts.get(capability)
}

// Bindings de todos los proveedores que declaran una capability: los
// candidatos brutos del router antes de filtros y puntuación.
export function bindingsFor(capability: string): Array<{ provider: ProviderDescriptor; binding: CapabilityBinding }> {
  const out: Array<{ provider: ProviderDescriptor; binding: CapabilityBinding }> = []
  for (const provider of providers.values()) {
    for (const binding of provider.capabilities) {
      if (binding.capability === capability) out.push({ provider, binding })
    }
  }
  return out
}

// Proveedores que admiten cuenta propia: la lista blanca de credenciales BYOK
// se deriva de aquí (sustituye al array cerrado de organizationCredentials).
export function byokProviderIds(): string[] {
  return listProviders()
    .filter((p) => p.auth.modes.includes('byok'))
    .map((p) => p.id)
}

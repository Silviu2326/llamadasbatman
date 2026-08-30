// Contratos normalizados de las capabilities iniciales
// (docs/plataforma-abierta/03-PROVEEDORES.md §1).
//
// El usuario pide una tarea ("mejorar esta imagen"), no una marca: estos
// esquemas son la interfaz estable que sobrevive a los proveedores. Un adapter
// traduce de aquí al dialecto de su API, nunca al revés.
import { z } from 'zod'
import { registerCapabilityContract } from './registry'

export const llmGenerateInput = z.object({
  prompt: z.string().min(1).max(64000),
  system: z.string().max(16000).optional(),
  // Modelo explícito solo cuando el adapter declara una lista cerrada. El
  // router fija además el proveedor para que un nombre de modelo nunca salte
  // accidentalmente a otro vendor.
  model: z.string().trim().min(1).max(160).optional(),
  maxTokens: z.number().int().positive().max(32000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  json: z.boolean().optional(),
})
export const llmGenerateOutput = z.object({
  text: z.string(),
  tokensIn: z.number().int().nonnegative().optional(),
  tokensOut: z.number().int().nonnegative().optional(),
})

export const imageGenerateInput = z.object({
  prompt: z.string().min(1).max(4000),
  // Referencias como assetIds de la biblioteca — nunca URLs arbitrarias.
  refAssetIds: z.array(z.string()).max(8).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:5']).default('1:1'),
  quality: z.enum(['draft', 'final']).default('draft'),
  count: z.number().int().min(1).max(4).default(1),
})
export const imageGenerateOutput = z.object({
  assetIds: z.array(z.string()),
})

export const imageUpscaleInput = z.object({
  assetId: z.string(),
  mode: z.enum(['faithful', 'creative', 'relight', 'restore']).default('faithful'),
  scale: z.number().int().min(2).max(16).default(2),
  prompt: z.string().max(2000).optional(),
})
export const imageUpscaleOutput = z.object({
  assetId: z.string(),
  versionId: z.string().optional(),
})

export const audioTtsInput = z.object({
  text: z.string().min(1).max(20000),
  voiceId: z.string().optional(),
  language: z.string().max(16).optional(),
  format: z.enum(['mp3', 'wav']).default('mp3'),
  consentGrantId: z.string().min(1).optional(),
  purpose: z.string().max(120).optional(),
  channel: z.string().max(120).optional(),
})
export const audioTtsOutput = z.object({
  assetId: z.string(),
  durationMs: z.number().int().nonnegative().optional(),
})

export const videoGenerateInput = z.object({
  prompt: z.string().min(1).max(4000),
  refAssetIds: z.array(z.string()).max(4).optional(),
  durationS: z.number().int().min(2).max(30).default(5),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  quality: z.enum(['draft', 'final']).default('draft'),
})
export const videoGenerateOutput = z.object({
  assetIds: z.array(z.string()),
})

export const videoUpscaleInput = z.object({
  assetId: z.string().min(1),
  durationS: z.number().min(0.1).max(30),
  fps: z.number().int().min(1).max(60).default(30),
  resolution: z.enum(['720p', '1k', '2k', '4k']).default('2k'),
})
export const videoUpscaleOutput = z.object({ assetIds: z.array(z.string()).min(1) })

export const webSearchInput = z.object({
  query: z.string().min(1).max(1000),
  count: z.number().int().min(1).max(20).default(10),
  freshnessDays: z.number().int().positive().optional(),
})
export const webSearchOutput = z.object({
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string().optional(),
  })),
})

let registered = false

// Registro idempotente: los tests y el arranque pueden importarlo más de una
// vez sin duplicar contratos.
export function registerCoreCapabilityContracts(): void {
  if (registered) return
  registered = true
  registerCapabilityContract({ capability: 'llm.generate', input: llmGenerateInput, output: llmGenerateOutput })
  registerCapabilityContract({ capability: 'image.generate', input: imageGenerateInput, output: imageGenerateOutput })
  registerCapabilityContract({ capability: 'image.upscale', input: imageUpscaleInput, output: imageUpscaleOutput })
  registerCapabilityContract({ capability: 'audio.tts', input: audioTtsInput, output: audioTtsOutput })
  registerCapabilityContract({ capability: 'video.generate', input: videoGenerateInput, output: videoGenerateOutput })
  registerCapabilityContract({ capability: 'video.upscale', input: videoUpscaleInput, output: videoUpscaleOutput })
  registerCapabilityContract({ capability: 'web.search', input: webSearchInput, output: webSearchOutput })
}

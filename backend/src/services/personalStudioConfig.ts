import { z } from 'zod'

export const studioBlockSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  type: z.enum(['brief', 'text', 'checklist', 'video-editor', 'zip-export', 'providers', 'library']),
  title: z.string().trim().min(1).max(70),
  description: z.string().trim().max(220),
  content: z.string().max(12000).default(''),
  items: z.array(z.object({ id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), text: z.string().trim().min(1).max(250), done: z.boolean() }).strict()).max(20).default([]),
}).strict()

export const studioConfigSchema = z.object({
  name: z.string().trim().min(1).max(70),
  description: z.string().trim().min(1).max(220),
  accent: z.enum(['violet', 'blue', 'emerald', 'rose', 'amber']),
  layout: z.enum(['grid', 'list']),
  density: z.enum(['comfortable', 'compact']),
  tools: z.array(z.enum(['video-editor', 'zip-export', 'providers'])).max(3).transform(items => [...new Set(items)]),
  activeTool: z.enum(['library', 'video-editor', 'zip-export', 'providers']),
  providerQuery: z.string().trim().max(80),
  formats: z.array(z.enum(['1:1', '4:5', '9:16', '16:9'])).min(1).max(4).transform(items => [...new Set(items)]),
  brief: z.string().trim().max(1500),
  preset: z.enum(['custom', 'podcast', 'free-values']).default('custom'),
  blocks: z.array(studioBlockSchema).max(12).default([]),
}).strict().refine(value => value.activeTool === 'library' || value.tools.includes(value.activeTool), 'La herramienta activa debe estar añadida al estudio')
  .refine(value => new Set(value.blocks.map(block => block.id)).size === value.blocks.length, 'Los bloques deben tener identificadores únicos')
  .refine(value => value.blocks.every(block => new Set(block.items.map(item => item.id)).size === block.items.length), 'Las tareas deben tener identificadores únicos')
  .refine(value => value.blocks.reduce((sum, block) => sum + block.content.length, 0) <= 48000, 'El estudio admite hasta 48.000 caracteres de contenido')
export type PersonalStudioConfig = z.infer<typeof studioConfigSchema>

export const DEFAULT_STUDIO: PersonalStudioConfig = {
  name: 'Mi estudio', description: 'Un espacio para tus ideas, tus herramientas y todo lo que creas.',
  accent: 'violet', layout: 'grid', density: 'comfortable',
  tools: [], activeTool: 'library', providerQuery: '', formats: ['1:1', '9:16', '16:9'], brief: '', preset: 'custom', blocks: [],
}
export const studioMessageSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }).strict()
export const studioStateSchema = z.object({
  config: studioConfigSchema, messages: z.array(studioMessageSchema).max(24),
  revision: z.number().int().nonnegative(), updatedAt: z.string().datetime().nullable(),
})
export type PersonalStudioState = z.infer<typeof studioStateSchema>
export const studioReplySchema = z.object({ message: z.string().trim().min(1).max(2000), config: studioConfigSchema }).strict()

export function settingsObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function readPersonalStudio(settings: unknown, userId: string): PersonalStudioState {
  const studios = settingsObject(settingsObject(settings).personalStudios)
  const parsed = studioStateSchema.safeParse(Object.hasOwn(studios, userId) ? studios[userId] : null)
  return parsed.success ? parsed.data : { config: { ...DEFAULT_STUDIO }, messages: [], revision: 0, updatedAt: null }
}

export function mergePersonalStudio(settings: unknown, userId: string, state: PersonalStudioState): Record<string, unknown> {
  const current = settingsObject(settings)
  return { ...current, personalStudios: { ...settingsObject(current.personalStudios), [userId]: studioStateSchema.parse(state) } }
}

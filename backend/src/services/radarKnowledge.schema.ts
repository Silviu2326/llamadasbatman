import { z } from 'zod'
export const radarServiceSchema = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).default(''),
  priceCents: z.number().int().min(0).max(100000000000).nullable(), currency: z.enum(['EUR', 'USD', 'GBP']).default('EUR'),
  billing: z.enum(['service', 'hour', 'month', 'year', 'project', 'unit']).default('service'),
}).strict()
export const radarKnowledgeSchema = z.object({
  website: z.string().trim().max(500).default(''), notes: z.string().trim().max(5000).default(''),
  services: z.array(radarServiceSchema).max(30).default([]), sourceIds: z.array(z.string().min(1).max(100)).max(20).default([]),
}).strict()
export type RadarKnowledge = z.infer<typeof radarKnowledgeSchema>
export const hasRadarKnowledge = (value?: RadarKnowledge) => Boolean(value && (value.sourceIds.length || value.services.length || value.notes.trim().length >= 10))

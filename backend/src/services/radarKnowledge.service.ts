import { createHash } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { createAssetFromBuffer } from './assets.service'
import { extractRadarDocument } from './radarDocument'
import { collectIntakePages } from './websiteIntake.crawler'
import { normalizeUrl } from './digitalAudit.service'
import { radarSetup } from './opportunityRadar'
import { radarKnowledgeSchema, type RadarKnowledge } from './radarKnowledge.schema'

const APP = 'business-opportunity-radar'
const SCOPE = 'radar-company-source'
const profileKey = (orgId: string) => ({ orgId_microappId_scope_scopeId: { orgId, microappId: APP, scope: 'radar-company-profile', scopeId: 'default' } })
const bad = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode })
type Source = { name: string; text: string; kind: string; warnings: string[]; url?: string; assetId?: string }
const sourceValue = (row: { id: string; values: unknown; createdAt: Date }) => ({ id: row.id, ...(row.values as Source), createdAt: row.createdAt })
const publicSource = (source: ReturnType<typeof sourceValue>) => ({ ...source, text: undefined, preview: source.text.slice(0, 1800), characters: source.text.length })

export async function getRadarKnowledge(orgId: string) {
  const [profile, rows] = await Promise.all([
    prisma.microappConfig.findUnique({ where: profileKey(orgId) }),
    prisma.microappConfig.findMany({ where: { orgId, microappId: APP, scope: SCOPE }, orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  const saved = profile ? radarKnowledgeSchema.parse(profile.values) : null
  const availableIds = new Set(rows.map(row => row.id))
  if (saved) saved.sourceIds = saved.sourceIds.filter(id => availableIds.has(id))
  return { profile: saved, sources: rows.map(row => publicSource(sourceValue(row))) }
}
async function selectedSources(orgId: string, ids: string[]) {
  const unique = [...new Set(ids)]
  const rows = await prisma.microappConfig.findMany({ where: { orgId, microappId: APP, scope: SCOPE, id: { in: unique } } })
  if (rows.length !== unique.length) throw bad('Alguna fuente ya no está disponible en esta organización.', 404)
  return rows.map(sourceValue)
}
export async function saveRadarKnowledge(orgId: string, profile: RadarKnowledge) {
  await selectedSources(orgId, profile.sourceIds)
  await prisma.microappConfig.upsert({ where: profileKey(orgId), update: { values: profile }, create: { orgId, microappId: APP, scope: 'radar-company-profile', scopeId: 'default', values: profile } })
  return { saved: true }
}
async function saveSource(orgId: string, scopeId: string, source: Source) {
  const count = await prisma.microappConfig.count({ where: { orgId, microappId: APP, scope: SCOPE } })
  const where = { orgId_microappId_scope_scopeId: { orgId, microappId: APP, scope: SCOPE, scopeId } }
  if (count >= 30 && !await prisma.microappConfig.findUnique({ where })) throw bad('Has alcanzado las 30 fuentes. Quita una del radar antes de añadir otra.')
  const row = await prisma.microappConfig.upsert({ where, update: { values: source }, create: { orgId, microappId: APP, scope: SCOPE, scopeId, values: source } })
  return publicSource(sourceValue(row))
}
export async function importRadarFile(orgId: string, userId: string, name: string, data: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw bad('Contenido de archivo inválido.')
  const buffer = Buffer.from(data, 'base64')
  const extracted = await extractRadarDocument(buffer, name)
  const asset = await createAssetFromBuffer({ orgId, createdById: userId, buffer, filename: `radar.${extracted.format}`, kind: extracted.format === 'xlsx' || extracted.format === 'csv' ? 'dataset' : 'document', provider: 'radar-company', params: { filename: name } })
  return saveSource(orgId, createHash('sha256').update(buffer).digest('hex'), { name, text: extracted.text, kind: extracted.format, warnings: extracted.warnings, assetId: asset.id })
}
export async function importRadarWebsite(orgId: string, website: string) {
  const url = normalizeUrl(website)
  const pages = await collectIntakePages(url)
  if (!pages.length) throw bad('No se pudo leer la web pública. Comprueba la dirección o sube un catálogo; algunas webs necesitan JavaScript o bloquean la lectura.')
  const raw = pages.map(page => `${page.title || page.url}\nFuente: ${page.url}\n${page.text}`).join('\n\n')
  return saveSource(orgId, createHash('sha256').update(url).digest('hex'), { name: new URL(url).hostname, url, kind: 'website', text: raw.slice(0, 60000), warnings: [`Se han leído ${pages.length} páginas públicas, hasta un máximo de 8. No se accede a áreas privadas ni a contenido que requiera JavaScript.`, ...(raw.length > 60000 ? ['Lectura limitada a 60.000 caracteres.'] : [])] })
}
export async function removeRadarSource(orgId: string, id: string) {
  const result = await prisma.microappConfig.deleteMany({ where: { id, orgId, microappId: APP, scope: SCOPE } })
  if (!result.count) throw bad('Fuente no encontrada.', 404)
  return { removed: true }
}

export function detectRadarOptions(material: Array<{ id: string; name: string; text: string }>, notes = '') {
  const activity = material.flatMap(source => source.text.split(/[\n.!?]/).filter(line => /software|saas|inmobiliaria|agencia|restaurante|hotel|tienda|fabricaci[oó]n|peluquer/i.test(line)).slice(0, 3).map(quote => ({ sourceId: source.id, sourceName: source.name, quote: quote.trim().slice(0, 300) }))).slice(0, 6)
  const evidence = activity.map(item => item.quote).join('. ') || notes
  const setup = radarSetup({ company: {}, profile: { description: evidence, idealCustomer: '' } })
  const business = setup.businesses.find(item => item.id === setup.suggestedType)!
  const services: Array<{ name: string; priceCents: number; currency: 'EUR' | 'USD' | 'GBP'; billing: 'service'; description: string; sourceName: string; quote: string }> = []
  for (const source of material) {
    for (const line of source.text.split('\n')) {
      const match = line.match(/^(.{3,160}?)\s*[|;:\t–-]?\s+(\d[\d., ]{0,15})[\s|;,]*(€|EUR|USD|GBP|\$|£)/i)
      if (!match || services.length >= 15) continue
      let amount = match[2].replace(/\s/g, '')
      if (amount.includes(',') && amount.includes('.')) amount = amount.lastIndexOf(',') > amount.lastIndexOf('.') ? amount.replace(/\./g, '').replace(',', '.') : amount.replace(/,/g, '')
      else amount = amount.replace(/([.,])(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
      const value = Number(amount)
      if (!Number.isFinite(value) || value < 0 || value > 1e9) continue
      const name = match[1].replace(/[|;:\s-]+$/, '').trim()
      if (services.some(item => item.name === name && item.priceCents === Math.round(value * 100))) continue
      services.push({ name, priceCents: Math.round(value * 100), currency: /USD|\$/.test(match[3]) ? 'USD' : /GBP|£/.test(match[3]) ? 'GBP' : 'EUR', billing: 'service', description: '', sourceName: source.name, quote: line.slice(0, 300) })
    }
  }
  return { suggestedType: setup.suggestedType, businessLabel: business.label, goals: business.goals, evidence: activity, services, message: 'Propuesta basada en el texto leído. Revisa la actividad, la periodicidad y si los precios incluyen impuestos antes de aplicarla.' }
}
export async function analyzeRadarKnowledge(orgId: string, profile: RadarKnowledge) {
  const sources = await selectedSources(orgId, profile.sourceIds)
  return detectRadarOptions(sources, [profile.notes, ...profile.services.map(service => `${service.name}. ${service.description}`)].join('\n'))
}
export async function resolveRadarKnowledge(orgId: string, profile?: RadarKnowledge) {
  if (!profile) return ''
  const sources = await selectedSources(orgId, profile.sourceIds)
  const header = [`INFORMACIÓN APORTADA POR LA EMPRESA (no es evidencia de oportunidades externas)`, `Web: ${profile.website}`, `Notas: ${profile.notes}`, `Servicios y tarifas declarados: ${JSON.stringify(profile.services)}`].join('\n\n')
  // Reparte el espacio entre todas las fuentes seleccionadas para no omitir las últimas.
  const perSource = Math.max(200, Math.min(6000, Math.floor((49000 - header.length) / Math.max(1, sources.length)) - 400))
  return [header, ...sources.map(source => `DOCUMENTO ${source.name} (${source.id})\n${source.text.slice(0, perSource)}\n${source.text.length > perSource ? `[Extracto limitado a ${perSource} caracteres para esta ejecución]` : ''}`)].join('\n\n').slice(0, 50000)
}

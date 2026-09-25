process.env.DATABASE_URL ??= 'postgresql://offline:offline@127.0.0.1:1/test'
import assert from 'node:assert/strict'
import test from 'node:test'
import { prisma } from '../lib/prisma'
import {
  applyPromptBudget,
  buildIntelligentPromptDetailed,
  KNOWLEDGE_CHARS_PER_ENTRY,
  KNOWLEDGE_ENTRIES,
  knowledgeIdsFromSettings,
  knowledgeSection,
  rankKnowledgeEntries,
  trimConversationHistory,
} from '../voice/intelligence/promptContext'

const day = (offset: number) => new Date(Date.UTC(2026, 8, 1 + offset))

test('el ranking léxico prefiere la ficha que habla del tema, no la más reciente', () => {
  const entries = [
    { id: 'reciente', name: 'Notas de la reunión', content: 'Acta interna sin relación con nada.', updatedAt: day(9) },
    { id: 'tarifas', name: 'Tarifas peluquerías', content: 'Plan profesional para peluquerías: 49 EUR al mes. Incluye agenda y recordatorios.', updatedAt: day(1) },
    { id: 'faq', name: 'Preguntas frecuentes', content: 'La agenda online para peluquerías sincroniza con Google Calendar.', updatedAt: day(2) },
  ]
  const ranked = rankKnowledgeEntries(entries, 'Carlos comercial software para peluquerías precio agenda')
  assert.deepEqual(ranked.map(entry => entry.id), ['tarifas', 'faq', 'reciente'])
  assert.ok(ranked[0]!.score > ranked[1]!.score && ranked[1]!.score > ranked[2]!.score)
  // Acentos y mayúsculas no rompen la coincidencia.
  assert.ok(rankKnowledgeEntries(entries, 'PELUQUERIAS')[0]!.score > 0)
})

test('sin consulta (o sin coincidencias) manda la recencia, y el cap por ficha subió a 1.500', () => {
  const entries = [
    { id: 'a', name: 'A', content: 'x'.repeat(5_000), updatedAt: day(1) },
    { id: 'b', name: 'B', content: 'y'.repeat(5_000), updatedAt: day(5) },
  ]
  const ranked = rankKnowledgeEntries(entries, '')
  assert.deepEqual(ranked.map(entry => entry.id), ['b', 'a'])
  assert.equal(KNOWLEDGE_CHARS_PER_ENTRY, 1_500)
  assert.equal(ranked[0]!.snippet.length, 1_500)
  assert.ok(KNOWLEDGE_ENTRIES >= 8)
})

test('el extracto se abre alrededor de la primera coincidencia cuando está lejos del principio', () => {
  const content = `${'Introducción corporativa. '.repeat(200)}La garantía cubre doce meses de servicio. ${'Más texto. '.repeat(50)}`
  const [ranked] = rankKnowledgeEntries([{ id: 'g', name: 'Condiciones', content }], 'garantía', { charsPerEntry: 300 })
  assert.match(ranked!.snippet, /garantia|garantía/i)
  assert.ok(ranked!.snippet.startsWith('…'))
})

test('knowledgeSection respeta settings.knowledgeIds y, sin ellos, usa toda la organización', async t => {
  const original = prisma.knowledgeBase.findMany
  const queries: any[] = []
  prisma.knowledgeBase.findMany = (async (args: any) => {
    queries.push(args)
    return [
      { id: 'k1', name: 'Tarifas', content: 'Plan 49 EUR', updatedAt: day(1) },
      { id: 'k2', name: 'Horarios', content: 'Abrimos de 9 a 20', updatedAt: day(2) },
    ]
  }) as any
  t.after(() => { prisma.knowledgeBase.findMany = original })

  const restricted = await knowledgeSection('org-a', { knowledgeIds: ['k1', 'k2'], query: 'tarifas' })
  assert.deepEqual(queries[0].where.id, { in: ['k1', 'k2'] })
  assert.equal(queries[0].where.orgId, 'org-a')
  assert.equal(restricted.entries[0]!.id, 'k1')
  assert.match(restricted.text ?? '', /^SUPPLEMENTARY KNOWLEDGE BASE/)

  await knowledgeSection('org-a', { knowledgeIds: null })
  assert.equal(queries[1].where.id, undefined)

  assert.deepEqual(knowledgeIdsFromSettings({ knowledgeIds: ['a', '', 'b'] }), ['a', 'b'])
  assert.equal(knowledgeIdsFromSettings({ knowledgeIds: [] }), null)
  assert.equal(knowledgeIdsFromSettings(null), null)
})

test('el presupuesto recorta proporcionalmente solo las secciones de contexto', () => {
  const sections = [
    { kind: 'base_prompt' as const, label: 'base', text: 'B'.repeat(1_000), shrinkable: false },
    { kind: 'knowledge' as const, label: 'kb', text: `${'K'.repeat(2_000)}\n${'K'.repeat(1_000)}\n${'K'.repeat(1_000)}`, shrinkable: true },
    { kind: 'lead' as const, label: 'lead', text: `${'L'.repeat(1_000)}\n${'L'.repeat(1_000)}`, shrinkable: true },
    { kind: 'style' as const, label: 'style', text: 'S'.repeat(500), shrinkable: false },
  ]
  const untouched = applyPromptBudget(sections, 100_000)
  assert.equal(untouched.trimmed, false)
  assert.equal(untouched.sections[1]!.text, sections[1]!.text)

  const budgeted = applyPromptBudget(sections, 4_000)
  assert.equal(budgeted.trimmed, true)
  assert.equal(budgeted.sections[0]!.text, sections[0]!.text, 'el guion base no se toca')
  assert.equal(budgeted.sections[3]!.text, sections[3]!.text, 'las directivas fijas no se tocan')
  assert.ok(budgeted.sections[1]!.text.length < sections[1]!.text.length)
  assert.ok(budgeted.sections[2]!.text.length < sections[2]!.text.length)
  // La sección grande cede más que la pequeña.
  const cutKnowledge = sections[1]!.text.length - budgeted.sections[1]!.text.length
  const cutLead = sections[2]!.text.length - budgeted.sections[2]!.text.length
  assert.ok(cutKnowledge > cutLead)
  assert.match(budgeted.sections[1]!.text, /trimmed to fit the prompt budget/)
})

test('buildIntelligentPromptDetailed usa los knowledgeIds del agente y registra las fuentes', async t => {
  const original = {
    agent: prisma.agent.findFirst,
    kb: prisma.knowledgeBase.findMany,
    org: prisma.organization.findUnique,
  }
  t.after(() => {
    prisma.agent.findFirst = original.agent
    prisma.knowledgeBase.findMany = original.kb
    prisma.organization.findUnique = original.org
  })
  const kbQueries: any[] = []
  prisma.agent.findFirst = (async () => ({ name: 'Carlos', role: 'Comercial de software para peluquerías', description: null, settings: { knowledgeIds: ['k-tarifas'] }, org: { industry: 'Software' } })) as any
  prisma.knowledgeBase.findMany = (async (args: any) => {
    kbQueries.push(args)
    return [{ id: 'k-tarifas', name: 'Tarifas peluquerías', content: 'Plan profesional 49 EUR al mes para peluquerías. Incluye agenda, recordatorios y soporte. '.repeat(40), updatedAt: day(1) }]
  }) as any
  prisma.organization.findUnique = (async () => null) as any

  const result = await buildIntelligentPromptDetailed({ orgId: 'org-a', agentId: 'ag-1', basePrompt: 'You are Carlos.', agentType: 'sales', agentName: 'Carlos', charBudget: 24_000 })
  assert.deepEqual(kbQueries[0].where.id, { in: ['k-tarifas'] })
  assert.match(result.prompt, /SUPPLEMENTARY KNOWLEDGE BASE/)
  assert.match(result.prompt, /49 EUR/)
  const knowledge = result.sources.find(source => source.kind === 'knowledge')
  assert.ok(knowledge)
  assert.deepEqual(knowledge!.entries!.map(entry => entry.id), ['k-tarifas'])
  assert.ok(knowledge!.entries![0]!.score > 0, 'rol y sector del agente puntúan la ficha')
  assert.equal(result.trimmed, false)
  assert.ok(result.sources.some(source => source.kind === 'base_prompt'))
  assert.equal(result.totalChars, result.prompt.length)

  // Con un presupuesto minúsculo el conocimiento se recorta y queda registrado.
  const tight = await buildIntelligentPromptDetailed({ orgId: 'org-a', agentId: 'ag-1', basePrompt: 'You are Carlos.', agentType: 'sales', charBudget: 3_000 })
  assert.equal(tight.trimmed, true)
  const tightKnowledge = tight.sources.find(source => source.kind === 'knowledge')!
  assert.ok(tightKnowledge.charsIncluded <= tightKnowledge.chars)
})

test('trimConversationHistory conserva los turnos recientes que caben y no deja al asistente primero', () => {
  const turns = [
    { role: 'user', content: 'a'.repeat(100) },
    { role: 'assistant', content: 'b'.repeat(100) },
    { role: 'user', content: 'c'.repeat(100) },
    { role: 'assistant', content: 'd'.repeat(100) },
    { role: 'user', content: 'e'.repeat(100) },
  ]
  assert.deepEqual(trimConversationHistory(turns, 10_000).map(turn => turn.role), ['user', 'assistant', 'user', 'assistant', 'user'])
  assert.deepEqual(trimConversationHistory(turns, 320).map(turn => turn.content[0]), ['c', 'd', 'e'])
  // 250 caracteres caben dos turnos (d, e) → se descarta el asistente huérfano.
  assert.deepEqual(trimConversationHistory(turns, 250).map(turn => turn.content[0]), ['e'])
  const single = trimConversationHistory(turns, 20)
  assert.equal(single.length, 1)
  assert.equal(single[0]!.content.length, 20)
  assert.ok(single[0]!.content.startsWith('…'))
  assert.deepEqual(trimConversationHistory([], 100), [])
})

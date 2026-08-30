import assert from 'node:assert/strict'
import test from 'node:test'
import { CALL_STRATEGIES, callStrategy, strategyDirective } from '../voice/callStrategies'
import { renderAgentOperatingNotes, renderBehaviorNotes } from '../voice/intelligence/promptContext'
import { buildVoiceRuntimeSnapshot } from '../voice/observability/voiceTrace'
import { createCallContext } from '../voice/intelligence/conversation/callContext'

test('el catálogo contiene estrategias completas y con identificadores únicos', () => {
  assert.equal(CALL_STRATEGIES.length, 8)
  assert.equal(new Set(CALL_STRATEGIES.map(strategy => strategy.id)).size, CALL_STRATEGIES.length)
  for (const strategy of CALL_STRATEGIES) {
    assert.equal(strategy.stages.length, 4, `${strategy.id} no tiene cuatro fases`)
    assert.ok(strategy.agentTypes.length > 0, `${strategy.id} sin tipos de agente`)
    assert.ok(strategy.directions.length > 0, `${strategy.id} sin dirección`)
    assert.ok(strategy.expectedOutcome.length > 20, `${strategy.id} sin resultado esperado`)
  }
})

test('elige la estrategia guardada solo cuando encaja con rol y dirección', () => {
  assert.equal(callStrategy('warm_reactivation', 'sales', 'outbound').id, 'warm_reactivation')
  assert.equal(callStrategy('payment_commitment', 'sales', 'outbound').id, 'permission_diagnosis')
  assert.equal(callStrategy(null, 'support', 'inbound').id, 'inbound_triage')
  assert.equal(callStrategy(null, 'collections', 'outbound').id, 'payment_commitment')
})

test('la directiva convierte la estrategia en instrucciones ejecutables para voz', () => {
  const prompt = strategyDirective(callStrategy('objection_to_evidence', 'sales', 'outbound'))
  assert.match(prompt, /CALL STRATEGY: Objeción a evidencia/)
  assert.match(prompt, /1\. Acknowledge:/)
  assert.match(prompt, /USEFUL QUESTIONS/)
  assert.match(prompt, /OBJECTION RULE/)
  assert.match(prompt, /EXPECTED OUTCOME/)
})

test('combina playbook personalizado, mensajes y escalado sin perder prioridad', () => {
  const notes = renderAgentOperatingNotes({
    customPlaybook: 'Name: Discovery SaaS v1\nSteps: ask about current workflow',
    keyMessages: 'La implantación tarda siete días.',
    escalationRules: 'Escalar si solicita una excepción contractual.',
  })
  assert.match(notes ?? '', /CUSTOM ORGANIZATION PLAYBOOK/)
  assert.match(notes ?? '', /PRIORITY MESSAGES/)
  assert.match(notes ?? '', /CUSTOM ESCALATION RULES/)
})

test('la traza guarda estrategia y playbook usados en la llamada', () => {
  const ctx = createCallContext({
    callSid: 'CA-test', phone: '+34123456789', orgId: 'org-1', agentId: 'agent-1',
    agentConfig: {
      softwareId: 'agent-1', activo: true, agentType: 'sales', callDirection: 'outbound',
      identity: { agentName: 'Sofía', agentGender: 'neutral', agentAccent: 'en' },
      product: { companyName: 'Vendrava', productName: 'Voice', targetVertical: 'SaaS', priceMonthly: 100, currency: 'EUR', currencySymbol: '€', marketCountry: 'ES' },
      playbook: { strategy: 'permission_diagnosis', customPlaybookId: 'pb-1', scripts: {} },
      compliance: { disclosureText: '', disclosureAi: true, timezone: 'Europe/Madrid', callHourStart: 9, callHourEnd: 20 },
      voice: {},
    },
  })
  const snapshot = buildVoiceRuntimeSnapshot(ctx, 'prompt')
  assert.equal(snapshot.strategyId, 'permission_diagnosis')
  assert.equal(snapshot.customPlaybookId, 'pb-1')
})

test('el comportamiento configurado por el cliente llega al prompt y se ignora si viene vacío', () => {
  assert.equal(renderBehaviorNotes(null), null)
  assert.equal(renderBehaviorNotes({}), null)
  assert.equal(renderBehaviorNotes({ formality: 'inventado', openingLine: '  ' }), null)

  const notes = renderBehaviorNotes({
    formality: 'usted',
    verbosity: 'brief',
    openingLine: 'Hola, soy Sofía de Vendrava.',
    structure: '1. Saludo. 2. Diagnóstico. 3. Cierre.',
    doNotSay: 'Descuentos y plazos de entrega.',
  }) ?? ''
  assert.match(notes, /AGENT BEHAVIOUR CONFIGURED BY THE CUSTOMER/)
  assert.match(notes, /"usted"/)
  assert.match(notes, /One or two short sentences/)
  assert.match(notes, /Hola, soy Sofía de Vendrava\./)
  assert.match(notes, /1\. Saludo\. 2\. Diagnóstico\. 3\. Cierre\./)
  assert.match(notes, /NEVER say or promise/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { AGENT_PLAYBOOKS, AGENT_TYPES, agentPlaybook, playbookDirective, playbookGreeting } from '../voice/agentPlaybooks'

test('cada tipo de agente declarado tiene playbook, y uno desconocido cae en comercial', () => {
  for (const type of AGENT_TYPES) {
    const playbook = AGENT_PLAYBOOKS[type]
    assert.equal(playbook.type, type)
    assert.ok(playbook.directions.length > 0, `${type} sin dirección`)
    assert.ok(playbook.objective.length > 10, `${type} sin objetivo`)
  }
  // Un agente creado antes de este catálogo trae agentType='sales' o algo raro:
  // debe llamar igual, no romper.
  assert.equal(agentPlaybook('inventado').type, 'sales')
  assert.equal(agentPlaybook(null).type, 'sales')
})

test('el saludo cambia según quién llamó a quién', () => {
  const identity = { agentName: 'Alex', companyName: 'Vendrava' }
  const inbound = playbookGreeting(AGENT_PLAYBOOKS.receptionist, 'inbound', identity)
  const outbound = playbookGreeting(AGENT_PLAYBOOKS.sales, 'outbound', identity)

  // Quien atiende agradece la llamada; quien llama se justifica.
  assert.match(inbound, /Thanks for calling/)
  assert.doesNotMatch(inbound, /I'll be quick/)
  assert.match(outbound, /this is Alex from Vendrava/)
})

test('recobro no ofrece transferencia y recepción la ofrece en cuanto hace falta', () => {
  const collections = playbookDirective(AGENT_PLAYBOOKS.collections, 'outbound')
  const reception = playbookDirective(AGENT_PLAYBOOKS.receptionist, 'inbound')

  assert.match(collections, /Do not offer to transfer/)
  assert.match(collections, /Do not try to book a meeting/)
  assert.match(reception, /as soon as it is clear a human is needed/)
})

test('la directiva dice al modelo quién llamó a quién', () => {
  assert.match(playbookDirective(AGENT_PLAYBOOKS.support, 'inbound'), /the caller phoned you/)
  assert.match(playbookDirective(AGENT_PLAYBOOKS.sales, 'outbound'), /you phoned them/)
})

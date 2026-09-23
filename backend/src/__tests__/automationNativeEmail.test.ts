import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAutomationActions } from '../services/automations.service'

test('las automatizaciones email requieren ids de borrador local', () => {
  assert.doesNotThrow(() => validateAutomationActions([
    { type: 'send_email_template', params: { emailDraftId: 'newsletter-draft-local' } },
  ]))
  assert.throws(() => validateAutomationActions([
    { type: 'send_email_template', params: { emailId: 'remote-provider-id' } },
  ]), /emailDraftId/)
})

test('las acciones legacy de segmentos ya no se aceptan', () => {
  assert.throws(() => validateAutomationActions([
    { type: 'send_to_external_segment', params: { segmentAlias: 'legacy-segment' } },
  ]), /Unsupported automation action/)
})


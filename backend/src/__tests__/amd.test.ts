import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyAmd } from '../voice/telephony/amd'

test('AMD maps Twilio machine and fax results', () => {
  assert.equal(classifyAmd({ answeredBy: 'machine_end_beep' }).classification, 'VOICEMAIL')
  assert.equal(classifyAmd({ answeredBy: 'fax' }).classification, 'FAX_OR_NOISE')
})

test('AMD recognizes gatekeeper and IVR opening speech', () => {
  assert.equal(classifyAmd({ answeredBy: 'human', speechResult: 'Buenos días, recepción' }).classification, 'GATEKEEPER')
  assert.equal(classifyAmd({ speechResult: 'Marque una opción' }).classification, 'IVR')
})

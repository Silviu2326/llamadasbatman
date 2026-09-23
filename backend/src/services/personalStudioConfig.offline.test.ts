import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STUDIO, mergePersonalStudio, readPersonalStudio, studioConfigSchema, studioReplySchema } from './personalStudioConfig'

test('studio updates preserve other users and unrelated organization settings', () => {
  const original = { voice: { enabled: true }, personalStudios: { other: { config: DEFAULT_STUDIO, messages: [], revision: 3, updatedAt: null } } }
  const state = { config: { ...DEFAULT_STUDIO, name: 'Mi montaje' }, messages: [], revision: 1, updatedAt: null }
  const merged = mergePersonalStudio(original, 'me', state)
  assert.deepEqual(merged.voice, original.voice)
  assert.deepEqual(readPersonalStudio(merged, 'other'), original.personalStudios.other)
  assert.equal(readPersonalStudio(merged, 'me').config.name, 'Mi montaje')
  assert.equal(readPersonalStudio(original, 'me').revision, 0)
})
test('missing organization data and missing users never expose another studio', () => {
  const state = { config: { ...DEFAULT_STUDIO, name: 'Private' }, messages: [], revision: 1, updatedAt: null }
  assert.equal(readPersonalStudio(mergePersonalStudio(null, 'user-a', state), 'user-b').config.name, DEFAULT_STUDIO.name)
  assert.equal(readPersonalStudio(null, 'user-a').revision, 0)
})
test('model cannot add arbitrary code, URLs or nonexistent modules', () => {
  assert.equal(studioConfigSchema.safeParse({ ...DEFAULT_STUDIO, tools: ['run-script'] }).success, false)
  assert.equal(studioConfigSchema.safeParse({ ...DEFAULT_STUDIO, javascript: 'alert(1)' }).success, false)
  assert.equal(studioConfigSchema.safeParse({ ...DEFAULT_STUDIO, accent: 'url(https://example.com)' }).success, false)
  assert.equal(studioConfigSchema.safeParse({ ...DEFAULT_STUDIO, activeTool: 'providers' }).success, false)
  assert.equal(studioReplySchema.safeParse({ message: 'Done', config: { ...DEFAULT_STUDIO, tools: ['video-editor'], activeTool: 'video-editor' } }).success, true)
})

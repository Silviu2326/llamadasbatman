import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_STUDIO, readPersonalStudio, studioConfigSchema } from './personalStudioConfig'
import { STUDIO_PRESETS, compileStudioBlueprint, describeStudioChanges } from './personalStudioPipeline'

test('legacy studios migrate without losing content, messages or revision', () => {
  const { blocks, preset, ...legacy } = DEFAULT_STUDIO
  const state = readPersonalStudio({ personalStudios: { me: { config: { ...legacy, name: 'Original' }, messages: [{ role: 'user', content: 'Mi idea' }], revision: 7, updatedAt: null } } }, 'me')
  assert.equal(state.revision, 7)
  assert.equal(state.config.name, 'Original')
  assert.deepEqual(state.config.blocks, [])
  assert.equal(state.messages[0].content, 'Mi idea')
})
test('presets compile into distinct useful workflows and reconcile tools', () => {
  for (const preset of STUDIO_PRESETS) {
    const result = compileStudioBlueprint({ message: 'Listo', config: { ...preset.config, tools: [] } }, DEFAULT_STUDIO)
    assert.ok(result.config.blocks.length)
    assert.ok(result.changes.length)
    assert.equal(result.config.preset, preset.id)
  }
  assert.ok(STUDIO_PRESETS[0].config.blocks.some(block => block.type === 'video-editor'))
  assert.ok(STUDIO_PRESETS[1].config.blocks.some(block => block.type === 'checklist'))
})
test('blueprints reject duplicate IDs, unknown renderers and unbounded content', () => {
  const config = STUDIO_PRESETS[0].config
  assert.equal(studioConfigSchema.safeParse({ ...config, blocks: [config.blocks[0], config.blocks[0]] }).success, false)
  assert.equal(studioConfigSchema.safeParse({ ...config, blocks: [{ ...config.blocks[0], type: 'execute-code' }] }).success, false)
  assert.equal(studioConfigSchema.safeParse({ ...config, blocks: [{ ...config.blocks[0], content: 'x'.repeat(12001) }] }).success, false)
  assert.throws(() => compileStudioBlueprint({ message: 'ok', config: { ...config, html: '<script />' } }, DEFAULT_STUDIO))
})
test('change receipts reflect actual edits and block order, not fabricated progress', () => {
  const config = STUDIO_PRESETS[0].config
  assert.deepEqual(describeStudioChanges(config, config), [])
  assert.deepEqual(describeStudioChanges(config, { ...config, blocks: [...config.blocks].reverse() }), ['Recorrido reorganizado'])
  assert.ok(describeStudioChanges(config, { ...config, blocks: config.blocks.slice(1) }).includes('Retirado: Brief del episodio'))
})

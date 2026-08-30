import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SELECTED_60_MICROAPPS, selected60Metadata } from '../microapps/selected60Catalog'
import { VISION_MICROAPPS } from '../microapps/visionCatalog'

test('la segunda expansión conserva exactamente 60 números contiguos e ids nuevos', () => {
  assert.equal(SELECTED_60_MICROAPPS.length, 60)
  assert.deepEqual(SELECTED_60_MICROAPPS.map(item => item.number), Array.from({ length: 60 }, (_, index) => index + 1))
  assert.equal(new Set(SELECTED_60_MICROAPPS.map(item => item.id)).size, 60)
  assert.equal(new Set(SELECTED_60_MICROAPPS.map(item => item.name)).size, 60)
  const previousIds = new Set<string>(VISION_MICROAPPS.map(item => item.id))
  for (const item of SELECTED_60_MICROAPPS) {
    assert.ok(!previousIds.has(item.id), `#${item.number}: ${item.id} ya pertenecía a la expansión anterior`)
    assert.equal(selected60Metadata(item.id), item)
  }
  assert.equal(selected60Metadata('does-not-exist'), undefined)
})

test('los tres packs contienen 20 productos cada uno', () => {
  const counts = new Map<string, number>()
  for (const item of SELECTED_60_MICROAPPS) counts.set(item.collection, (counts.get(item.collection) ?? 0) + 1)
  assert.equal(counts.get('revenue-agency'), 20)
  assert.equal(counts.get('intelligence-growth'), 20)
  assert.equal(counts.get('media-aiops'), 20)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { MAPS, PERKS, SYSTEM_RULES, WEAPONS, WORLD, normalizeSpawn, roundPlan, spawnFits } from '../src/game/content.js'

test('ships three original maps with independent five-stage mysteries', () => {
  assert.equal(MAPS.length, 3)
  assert.equal(new Set(MAPS.map(map => map.id)).size, MAPS.length)
  for (const map of MAPS) {
    assert.equal(map.quest.length, 5, map.id)
    assert.equal(map.quest.at(-1).type, 'boss', map.id)
    assert.ok(map.stations.filter(station => station.type === 'perk').length >= 4, map.id)
    assert.ok(map.stations.filter(station => station.type === 'weapon').length >= 3, map.id)
  }
})

test('all map content stays inside the playable world and has unique station ids', () => {
  for (const map of MAPS) {
    assert.equal(new Set(map.stations.map(item => item.id)).size, map.stations.length, map.id)
    for (const item of [...map.stations, ...map.spawns]) {
      assert.ok(item.x >= 0 && item.x <= WORLD.width, `${map.id}:${item.id || 'spawn'} x`)
      assert.ok(item.y >= 0 && item.y <= WORLD.height, `${map.id}:${item.id || 'spawn'} y`)
      assert.ok(!map.obstacles.some(rect => item.x >= rect.x && item.x <= rect.x + rect.w && item.y >= rect.y && item.y <= rect.y + rect.h), `${map.id}:${item.id || 'spawn'} inside obstacle`)
    }
    for (const rect of map.obstacles) {
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= WORLD.width && rect.y + rect.h <= WORLD.height, map.id)
    }
  }
})

test('every quest interaction references a station present in its map', () => {
  for (const map of MAPS) {
    const ids = new Set(map.stations.map(item => item.id))
    for (const stage of map.quest) {
      for (const id of stage.ids || []) assert.ok(ids.has(id), `${map.id}:${id}`)
      if (stage.id) assert.ok(ids.has(stage.id), `${map.id}:${stage.id}`)
    }
  }
})

test('round pressure grows while respecting hard caps', () => {
  let previous = roundPlan(1)
  for (let round = 2; round <= 100; round += 1) {
    const current = roundPlan(round)
    assert.ok(current.count >= previous.count)
    assert.ok(current.hp >= previous.hp)
    assert.ok(current.speed >= previous.speed)
    assert.ok(current.count <= 105)
    assert.ok(current.hp <= 3200)
    assert.ok(current.maxAlive <= 26)
    assert.ok(current.interval >= 310)
    previous = current
  }
})

test('economy content has seven complete weapons and four unique drinks', () => {
  assert.deepEqual(Object.keys(PERKS), ['ferreo', 'cobalto', 'vector', 'respiro'])
  assert.equal(Object.keys(WEAPONS).length, 7)
  for (const weapon of Object.values(WEAPONS)) {
    assert.ok(weapon.damage > 0 && weapon.magazine > 0 && weapon.reserve >= weapon.magazine)
    assert.ok(weapon.fireMs > 0 && weapon.reloadMs > 0 && weapon.range > 0)
  }
})

test('every map has original sector progression and a distinct powered system set', () => {
  assert.equal(new Set(MAPS.map(map => map.event.id)).size, MAPS.length)
  assert.equal(new Set(MAPS.map(map => map.trap.effect)).size, MAPS.length)
  assert.equal(new Set(MAPS.map(map => map.boss.behavior)).size, MAPS.length)
  for (const map of MAPS) {
    assert.equal(map.gates.length, 3, map.id)
    assert.equal(new Set(map.gates.map(gate => gate.id)).size, 3, map.id)
    assert.ok(map.power.requirements.length >= 1, map.id)
    assert.ok(map.trap.cost > 0 && map.trap.componentCost > 0 && map.trap.duration > 0, map.id)
    assert.ok(map.armory.cost > 0 && map.event.every >= 5, map.id)
    const gateIds = new Set(map.gates.map(gate => gate.id))
    assert.ok(gateIds.has(map.trap.gate), `${map.id}:trap gate`)
    assert.ok(gateIds.has(map.armory.gate), `${map.id}:armory gate`)
    assert.ok(gateIds.has(map.extraction.gate), `${map.id}:extraction gate`)
    const stationIds = new Set(map.stations.map(station => station.id))
    for (const id of map.power.requirements) assert.ok(stationIds.has(id), `${map.id}:${id}`)
    for (const item of [map.power, map.trap, map.armory, map.extraction]) {
      assert.ok(item.x >= 0 && item.x <= WORLD.width && item.y >= 0 && item.y <= WORLD.height, `${map.id}:${item.name}`)
      assert.ok(!map.obstacles.some(rect => item.x >= rect.x && item.x <= rect.x + rect.w && item.y >= rect.y && item.y <= rect.y + rect.h), `${map.id}:${item.name} blocked`)
    }
    for (const gate of map.gates) {
      assert.ok(gate.cost > 0 && gate.x >= 0 && gate.y >= 0 && gate.x + gate.w <= WORLD.width && gate.y + gate.h <= WORLD.height, `${map.id}:${gate.id}`)
      assert.ok(!map.obstacles.some(rect => gate.x < rect.x + rect.w && gate.x + gate.w > rect.x && gate.y < rect.y + rect.h && gate.y + gate.h > rect.y), `${map.id}:${gate.id} overlaps obstacle`)
    }
  }
})

test('large enemy and boss spawn selection has valid clearance after world clamping', () => {
  for (const map of MAPS) {
    for (const radius of [18, 31, 42]) {
      const candidates = map.spawns.filter(point => spawnFits(map, point, radius))
      assert.ok(candidates.length >= 2, `${map.id}:r${radius}`)
      for (const point of candidates) {
        const normalized = normalizeSpawn(point, radius)
        assert.ok(normalized.x >= radius + 10 && normalized.x <= WORLD.width - radius - 10)
        assert.ok(normalized.y >= radius + 10 && normalized.y <= WORLD.height - radius - 10)
      }
    }
  }
})

test('contraband pool and component sinks make the second economy meaningful', () => {
  assert.equal(SYSTEM_RULES.armoryPool.length, 6)
  assert.equal(new Set(SYSTEM_RULES.armoryPool).size, SYSTEM_RULES.armoryPool.length)
  for (const id of SYSTEM_RULES.armoryPool) assert.ok(WEAPONS[id], id)
  assert.ok(SYSTEM_RULES.forgeComponents.filter(cost => cost > 0).length >= 2)
  assert.ok(MAPS.every(map => map.trap.componentCost > 0))
  assert.ok(WEAPONS.prism.penetration >= 2)
  assert.ok(WEAPONS.mercury.chainRadius > 0)
  assert.ok(WEAPONS.solar.splashRadius > 0)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { MAPS, WEAPONS } from '../src/game/content.js'
import { UmbraRuntime } from '../src/game/runtime.js'

function weapon(id, level = 0) {
  return { id, ammo: WEAPONS[id].magazine, reserve: WEAPONS[id].reserve, level, reloading: 0 }
}

function runtimeState() {
  const runtime = Object.create(UmbraRuntime.prototype)
  runtime.map = MAPS[0]
  runtime.random = () => 0
  runtime.onGameOver = () => {}
  runtime.state = {
    elapsed: 0, round: 1, phase: 'active', pendingSpawns: 0, spawnCooldown: 0,
    score: 0,
    message: '',
    messageTimer: 0,
    gates: Object.fromEntries(runtime.map.gates.map(gate => [gate.id, false])),
    powerOnline: false,
    trap: { activeUntil: 0, cooldownUntil: 0 },
    armory: { offer: null, expiresAt: 0, history: [] },
    extraction: { available: false, active: false, timer: 0 }, endReason: null,
    quest: { stage: 0, progress: 3, activated: ['fuse-a', 'fuse-b', 'fuse-c'], timer: 0, started: false, completed: false, bossSpawned: false },
    player: {
      credits: 10000,
      scrap: 10,
      weapons: [weapon('service'), null],
      activeWeapon: 0,
      perks: [],
    },
  }
  return runtime
}

test('opening a sector is atomic and only charges once', () => {
  const runtime = runtimeState()
  runtime.state.player.credits = 900
  const gate = runtime.map.gates[0]
  runtime.openGate(gate)
  assert.equal(runtime.state.gates[gate.id], true)
  assert.equal(runtime.state.player.credits, 150)
  runtime.openGate(gate)
  assert.equal(runtime.state.player.credits, 150)
})

test('finishing the first anomaly restores power and grants starter components', () => {
  const runtime = runtimeState()
  const before = runtime.state.player.scrap
  runtime.advanceQuest()
  assert.equal(runtime.state.powerOnline, true)
  assert.equal(runtime.state.quest.stage, 1)
  assert.equal(runtime.state.player.scrap, before + 2)
})

test('wall weapons fill two independent slots and switching preserves both states', () => {
  const runtime = runtimeState()
  runtime.buyWeapon('rust', 1350)
  assert.deepEqual(runtime.state.player.weapons.map(item => item?.id), ['service', 'rust'])
  assert.equal(runtime.state.player.activeWeapon, 1)
  runtime.state.player.weapons[1].ammo = 7
  runtime.switchWeapon(0)
  assert.equal(runtime.currentWeapon().id, 'service')
  runtime.switchWeapon()
  assert.equal(runtime.currentWeapon().id, 'rust')
  assert.equal(runtime.currentWeapon().ammo, 7)
})

test('unstable contraband is deterministic, collectible and avoids recent repeats', () => {
  const runtime = runtimeState()
  runtime.state.powerOnline = true
  runtime.useArmory()
  const first = runtime.state.armory.offer
  assert.ok(first)
  runtime.useArmory()
  assert.equal(runtime.state.player.weapons[1].id, first)
  runtime.useArmory()
  assert.ok(runtime.state.armory.offer)
  assert.notEqual(runtime.state.armory.offer, first)
})

test('forge and map trap consume the component economy', () => {
  const runtime = runtimeState()
  runtime.state.powerOnline = true
  runtime.state.player.weapons[0] = weapon('service', 1)
  runtime.state.player.credits = 10000
  runtime.state.player.scrap = 5
  runtime.upgradeWeapon()
  assert.equal(runtime.currentWeapon().level, 2)
  assert.equal(runtime.state.player.scrap, 2)
  runtime.state.player.credits = 5000
  runtime.state.player.scrap = 4
  runtime.activateTrap()
  assert.equal(runtime.state.player.scrap, 2)
  assert.ok(runtime.state.trap.activeUntil > runtime.state.elapsed)
})

test('completing the mystery unlocks an in-world extraction holdout', () => {
  const runtime = runtimeState()
  runtime.state.quest.stage = runtime.map.quest.length - 1
  runtime.advanceQuest()
  assert.equal(runtime.state.extraction.available, true)
  runtime.startExtraction()
  assert.equal(runtime.state.extraction.active, true)
  assert.equal(runtime.state.extraction.timer, 30)
  assert.ok(runtime.state.pendingSpawns > 0)
  let result = null
  runtime.publish = () => {}
  runtime.getSnapshot = () => ({ endReason: runtime.state.endReason })
  runtime.onGameOver = value => { result = value }
  runtime.state.extraction.timer = 0.01
  runtime.updateExtraction(0.02)
  assert.equal(runtime.state.phase, 'gameover')
  assert.equal(runtime.state.endReason, 'extracted')
  assert.deepEqual(result, { endReason: 'extracted' })
})

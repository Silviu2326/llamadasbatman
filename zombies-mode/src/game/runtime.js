import { MAPS, PERKS, SYSTEM_RULES, WEAPONS, WORLD, normalizeSpawn, roundPlan, spawnFits } from './content.js'

const TAU = Math.PI * 2
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const lerp = (a, b, t) => a + (b - a) * t

function seeded(seed) {
  let value = seed >>> 0 || 0x71f3a91d
  return () => {
    value = Math.imul(value ^ (value >>> 15), 1 | value)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function rayRectDistance(origin, dir, rect, maxDistance) {
  let near = 0
  let far = maxDistance
  for (const [position, delta, min, max] of [
    [origin.x, dir.x, rect.x, rect.x + rect.w],
    [origin.y, dir.y, rect.y, rect.y + rect.h],
  ]) {
    if (Math.abs(delta) < 0.0001) {
      if (position < min || position > max) return Infinity
      continue
    }
    const a = (min - position) / delta
    const b = (max - position) / delta
    near = Math.max(near, Math.min(a, b))
    far = Math.min(far, Math.max(a, b))
    if (near > far) return Infinity
  }
  return near >= 0 ? near : Infinity
}

function circleRectCollision(entity, rect) {
  const x = clamp(entity.x, rect.x, rect.x + rect.w)
  const y = clamp(entity.y, rect.y, rect.y + rect.h)
  return Math.hypot(entity.x - x, entity.y - y) < entity.r
}

function directionColumn(angle) {
  const x = Math.cos(angle)
  const y = Math.sin(angle)
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 1 : 3
  return y < 0 ? 2 : 0
}

function weaponState(id) {
  const weapon = WEAPONS[id]
  return { id, ammo: weapon.magazine, reserve: weapon.reserve, level: 0, reloading: 0 }
}

export class UmbraRuntime {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.map = MAPS.find(item => item.id === options.mapId) || MAPS[0]
    this.seed = options.seed || Date.now()
    this.random = seeded(this.seed)
    this.onSnapshot = options.onSnapshot || (() => {})
    this.onGameOver = options.onGameOver || (() => {})
    this.keys = new Set()
    this.virtual = new Set()
    this.pointer = { x: WORLD.width / 2, y: WORLD.height / 2, down: false, active: false }
    this.images = { maps: new Image(), sprites: new Image(), systems: new Image() }
    this.images.maps.src = '/assets/maps-atlas.png'
    this.images.sprites.src = '/assets/sprites-atlas.png'
    this.images.systems.src = '/assets/systems-v2-atlas.png'
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.bound = {
      keydown: event => this.onKeyDown(event), keyup: event => this.onKeyUp(event),
      pointermove: event => this.onPointerMove(event), pointerdown: event => this.onPointerDown(event),
      pointerup: () => { this.pointer.down = false }, blur: () => this.pause(true),
    }
    window.addEventListener('keydown', this.bound.keydown)
    window.addEventListener('keyup', this.bound.keyup)
    window.addEventListener('pointerup', this.bound.pointerup)
    window.addEventListener('blur', this.bound.blur)
    canvas.addEventListener('pointermove', this.bound.pointermove)
    canvas.addEventListener('pointerdown', this.bound.pointerdown)
    this.reset()
  }

  reset() {
    const spawn = this.map.playerSpawn
    this.state = {
      phase: 'intermission', round: 1, roundTimer: 3, elapsed: 0, score: 0,
      player: { x: spawn.x, y: spawn.y, r: 18, hp: 150, maxHp: 150, armor: 75, maxArmor: 100, angle: -Math.PI / 2, credits: 900, scrap: 0, weapons: [weaponState('service'), null], activeWeapon: 0, perks: [], usedRevive: false, invulnerable: 0 },
      enemies: [], tracers: [], particles: [], pickups: [], nextId: 1,
      pendingSpawns: 0, spawnCooldown: 0, kills: 0, combo: 0, comboTimer: 0,
      message: 'La señal despierta bajo la ciudad', messageTimer: 3.6,
      quest: { stage: 0, progress: 0, activated: [], timer: 0, started: false, completed: false, bossSpawned: false },
      gates: Object.fromEntries(this.map.gates.map(gate => [gate.id, false])), powerOnline: false,
      trap: { activeUntil: 0, cooldownUntil: 0 }, armory: { offer: null, expiresAt: 0, history: [] },
      extraction: { available: false, active: false, timer: 0 }, endReason: null,
      roundEvent: null, prompt: null, weaponCooldown: 0, power: { doubleUntil: 0 },
    }
    this.previous = performance.now()
    this.accumulator = 0
    this.snapshotClock = 0
    this.running = true
    this.raf = requestAnimationFrame(time => this.frame(time))
    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio))
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio))
    this.pixelRatio = ratio
  }

  frame(time) {
    if (!this.running) return
    const delta = Math.min(250, time - this.previous)
    this.previous = time
    if (this.state.phase !== 'paused' && this.state.phase !== 'gameover') this.accumulator += delta
    while (this.accumulator >= 1000 / 60) {
      this.update(1 / 60)
      this.accumulator -= 1000 / 60
    }
    this.render()
    this.snapshotClock += delta
    if (this.snapshotClock >= 100) { this.snapshotClock = 0; this.publish() }
    this.raf = requestAnimationFrame(next => this.frame(next))
  }

  update(dt) {
    const state = this.state
    state.elapsed += dt
    state.messageTimer = Math.max(0, state.messageTimer - dt)
    state.weaponCooldown = Math.max(0, state.weaponCooldown - dt * 1000)
    state.player.invulnerable = Math.max(0, state.player.invulnerable - dt)
    state.comboTimer -= dt
    if (state.comboTimer <= 0) state.combo = 0

    this.updatePlayer(dt)
    this.updateWeapon(dt)
    this.updateQuest(dt)
    this.updateExtraction(dt)
    this.updateRound(dt)
    this.updateTrap(dt)
    this.updateEnemies(dt)
    this.updatePickups(dt)
    state.tracers = state.tracers.filter(item => (item.life -= dt) > 0)
    state.particles = state.particles.filter(item => {
      item.life -= dt; item.x += item.vx * dt; item.y += item.vy * dt
      return item.life > 0
    })
    this.updatePrompt()
  }

  updatePlayer(dt) {
    const player = this.state.player
    let dx = (this.isDown('KeyD', 'right') || this.keys.has('ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'left') || this.keys.has('ArrowLeft') ? 1 : 0)
    let dy = (this.isDown('KeyS', 'down') || this.keys.has('ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'up') || this.keys.has('ArrowUp') ? 1 : 0)
    const length = Math.hypot(dx, dy) || 1
    const speed = 205 * (player.perks.includes('vector') ? 1.15 : 1)
    dx = dx / length * speed * dt
    dy = dy / length * speed * dt
    this.moveEntity(player, dx, 0)
    this.moveEntity(player, 0, dy)

    if (this.pointer.active) player.angle = Math.atan2(this.pointer.y - player.y, this.pointer.x - player.x)
    else {
      const nearest = this.nearestEnemy()
      if (nearest) player.angle = Math.atan2(nearest.y - player.y, nearest.x - player.x)
    }

    if ((this.pointer.down || this.isDown('Space', 'fire')) && this.state.phase === 'active') this.fire()
    for (const hazard of this.map.hazards) {
      if (hazard.kind === 'seal') continue
      if (Math.hypot(player.x - hazard.x, player.y - hazard.y) < hazard.r) {
        const pulse = hazard.kind === 'storm' ? Math.sin(this.state.elapsed * 2.4) > 0.82 : true
        if (pulse) this.damagePlayer(hazard.kind === 'storm' ? 9 * dt : 5 * dt)
      }
    }
  }

  updateWeapon(dt) {
    const current = this.currentWeapon()
    if (current.reloading > 0) {
      current.reloading -= dt * 1000
      if (current.reloading <= 0) {
        const weapon = WEAPONS[current.id]
        const capacity = weapon.magazine + current.level * Math.ceil(weapon.magazine * 0.2)
        const moved = Math.min(capacity - current.ammo, current.reserve)
        current.ammo += moved
        current.reserve -= moved
        this.sound(330, 0.05, 'square')
      }
    }
  }

  currentWeapon() { return this.state.player.weapons[this.state.player.activeWeapon] }

  switchWeapon(slot) {
    const player = this.state.player
    const next = slot ?? (player.activeWeapon === 0 ? 1 : 0)
    if (!player.weapons[next]) return
    player.activeWeapon = next
    this.state.weaponCooldown = 180
    this.announce(WEAPONS[this.currentWeapon().id].name.toUpperCase(), 1.1)
  }

  updateRound(dt) {
    const state = this.state
    if (state.phase === 'intermission') {
      state.roundTimer -= dt
      if (state.roundTimer <= 0) {
        const plan = roundPlan(state.round)
        state.pendingSpawns = plan.count
        state.spawnCooldown = 0
        state.phase = 'active'
        state.roundEvent = state.round % this.map.event.every === 0 ? { ...this.map.event, active: true } : null
        if (state.roundEvent) this.announce(`EVENTO · ${state.roundEvent.name.toUpperCase()}`, 3.2)
        else this.announce(`RONDA ${state.round}`)
      }
      return
    }
    if (state.phase !== 'active') return
    const plan = roundPlan(state.round)
    state.spawnCooldown -= dt * 1000
    if (state.pendingSpawns > 0 && state.enemies.length < plan.maxAlive && state.spawnCooldown <= 0) {
      this.spawnEnemy(plan)
      state.pendingSpawns -= 1
      state.spawnCooldown = plan.interval
    }
    if (state.pendingSpawns === 0 && state.enemies.length === 0 && !this.isBossStage()) {
      state.player.credits += 220 + state.round * 18
      state.score += 500 + state.round * 75
      state.round += 1
      if (state.roundEvent) {
        state.player.scrap += 2
        for (const weapon of state.player.weapons.filter(Boolean)) weapon.reserve = Math.max(weapon.reserve, Math.ceil(WEAPONS[weapon.id].reserve * 0.6))
        this.announce(`EVENTO SUPERADO · MUNICIÓN + 2 COMPONENTES`, 3.2)
      } else this.announce('OLEADA SUPERADA')
      state.roundEvent = null
      state.phase = 'intermission'
      state.roundTimer = 7
      state.player.armor = Math.min(state.player.maxArmor, state.player.armor + 15)
    }
  }

  spawnEnemy(plan, forcedType) {
    const spawn = this.map.spawns[Math.floor(this.random() * this.map.spawns.length)]
    let type = forcedType || this.state.roundEvent?.enemy || 'standard'
    if (!forcedType && !this.state.roundEvent && this.state.round >= 5 && this.state.pendingSpawns === 1 && this.state.round % 5 === 0) type = 'brute'
    else if (!forcedType && !this.state.roundEvent && this.state.round >= 8 && this.random() < 0.08) type = 'specter'
    else if (!forcedType && !this.state.roundEvent && this.state.round >= 4 && this.random() < 0.24) type = 'runner'
    const multipliers = type === 'brute' ? { hp: 7.5, speed: 0.62, damage: 2.2, radius: 31 } : type === 'specter' ? { hp: 0.75, speed: 1.48, damage: 0.8, radius: 15 } : type === 'runner' ? { hp: 0.82, speed: 1.3, damage: 0.9, radius: 16 } : { hp: 1, speed: 1, damage: 1, radius: 18 }
    const safeSpawn = this.findSafeSpawn(multipliers.radius, spawn)
    this.state.enemies.push({
      id: this.state.nextId++, x: safeSpawn.x, y: safeSpawn.y, r: multipliers.radius,
      hp: plan.hp * multipliers.hp, maxHp: plan.hp * multipliers.hp,
      speed: plan.speed * multipliers.speed, damage: 18 * multipliers.damage,
      type, attackCooldown: this.random() * 0.5, stagger: 0, angle: 0, boss: false,
    })
  }

  spawnBoss(name) {
    const spawn = this.findSafeSpawn(42, this.map.spawns[5])
    const hp = 5500 + this.state.round * 720
    this.state.enemies.push({ id: this.state.nextId++, x: spawn.x, y: spawn.y, r: 42, hp, maxHp: hp, speed: 55, damage: 34, type: 'brute', attackCooldown: 1.2, stagger: 0, specialCooldown: 3.5, phase: 1, angle: 0, boss: true, name, behavior: this.map.boss.behavior })
    this.state.pendingSpawns = 0
    this.state.enemies = [...this.state.enemies.filter(enemy => enemy.boss), ...this.state.enemies.filter(enemy => !enemy.boss).slice(0, 4)]
    this.announce(`${name.toUpperCase()} HA DESPERTADO`, 4)
  }

  updateBoss(enemy, dt) {
    enemy.phase = enemy.hp < enemy.maxHp * 0.35 ? 3 : enemy.hp < enemy.maxHp * 0.7 ? 2 : 1
    enemy.specialCooldown -= dt
    if (enemy.specialCooldown > 0) return
    if (enemy.behavior === 'warden') {
      this.spawnEnemy(roundPlan(this.state.round), 'runner')
      if (enemy.phase >= 2) this.spawnEnemy(roundPlan(this.state.round), 'runner')
      enemy.specialCooldown = 6 - enemy.phase * 0.65
      this.announce('SILBATO DEL REVISOR · CORREDORES', 1.8)
    } else if (enemy.behavior === 'cartographer') {
      const next = this.findSafeSpawn(enemy.r, this.map.spawns[Math.floor(this.random() * this.map.spawns.length)])
      this.particles(enemy.x, enemy.y, '#82b7df', 18)
      enemy.x = next.x; enemy.y = next.y
      this.spawnEnemy(roundPlan(this.state.round), 'specter')
      enemy.specialCooldown = 5.7 - enemy.phase * 0.55
      this.announce('PLIEGUE ASTRAL · RASTREA LA SOMBRA', 1.8)
    } else {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * (0.012 + enemy.phase * 0.004))
      this.spawnEnemy(roundPlan(this.state.round), 'standard')
      enemy.specialCooldown = 5.4 - enemy.phase * 0.5
      this.announce('RAÍCES VIVAS · CORTA LA REGENERACIÓN', 1.8)
    }
  }

  updateEnemies(dt) {
    const player = this.state.player
    for (const enemy of this.state.enemies) {
      enemy.stagger = Math.max(0, enemy.stagger - dt)
      enemy.attackCooldown -= dt
      if (enemy.boss) this.updateBoss(enemy, dt)
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x)
      enemy.angle = angle
      const gap = distance(enemy, player)
      if (gap > enemy.r + player.r + 5 && enemy.stagger <= 0) {
        const pace = enemy.speed * (enemy.type === 'specter' ? 1 + Math.sin(this.state.elapsed * 4) * 0.08 : 1)
        this.moveEntity(enemy, Math.cos(angle) * pace * dt, 0)
        this.moveEntity(enemy, 0, Math.sin(angle) * pace * dt)
      } else if (enemy.attackCooldown <= 0) {
        this.damagePlayer(enemy.damage)
        enemy.attackCooldown = enemy.boss ? 0.72 : 1.05
      }
    }
    for (let i = 0; i < this.state.enemies.length; i += 1) {
      for (let j = i + 1; j < this.state.enemies.length; j += 1) {
        const a = this.state.enemies[i], b = this.state.enemies[j]
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
        const overlap = a.r + b.r - len
        if (overlap > 0) { a.x -= dx / len * overlap * 0.18; a.y -= dy / len * overlap * 0.18; b.x += dx / len * overlap * 0.18; b.y += dy / len * overlap * 0.18 }
      }
    }
  }

  moveEntity(entity, dx, dy) {
    entity.x = clamp(entity.x + dx, entity.r + 10, WORLD.width - entity.r - 10)
    if (this.blockingRects(entity).some(rect => circleRectCollision(entity, rect))) entity.x -= dx
    entity.y = clamp(entity.y + dy, entity.r + 10, WORLD.height - entity.r - 10)
    if (this.blockingRects(entity).some(rect => circleRectCollision(entity, rect))) entity.y -= dy
  }

  blockingRects(entity) {
    if (entity !== this.state.player) return this.map.obstacles
    const closedGates = this.map.gates.filter(gate => !this.state.gates[gate.id])
    return [...this.map.obstacles, ...closedGates]
  }

  findSafeSpawn(radius, preferred) {
    const candidates = [preferred, ...this.map.spawns]
    for (const point of candidates) {
      const candidate = normalizeSpawn(point, radius)
      if (spawnFits(this.map, point, radius) && distance(candidate, this.state.player) > 220) return candidate
    }
    return { x: WORLD.width / 2, y: 55, r: radius }
  }

  fire() {
    const state = this.state
    const current = this.currentWeapon()
    const weapon = WEAPONS[current.id]
    if (current.reloading > 0 || state.weaponCooldown > 0) return
    if (current.ammo <= 0) { this.reload(); return }
    current.ammo -= 1
    state.weaponCooldown = weapon.fireMs
    const origin = state.player
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      const angle = origin.angle + (this.random() - 0.5) * weapon.spread
      const dir = { x: Math.cos(angle), y: Math.sin(angle) }
      let hitDistance = weapon.range
      for (const rect of this.map.obstacles) hitDistance = Math.min(hitDistance, rayRectDistance(origin, dir, rect, weapon.range))
      const targets = []
      for (const enemy of state.enemies) {
        const rx = enemy.x - origin.x, ry = enemy.y - origin.y
        const projected = rx * dir.x + ry * dir.y
        if (projected <= 0 || projected >= hitDistance) continue
        const perpendicular = Math.abs(rx * dir.y - ry * dir.x)
        if (perpendicular <= enemy.r + 3) targets.push({ enemy, projected, perpendicular })
      }
      targets.sort((a, b) => a.projected - b.projected)
      const penetration = Math.max(1, weapon.penetration || 1)
      const hits = targets.filter(hit => hit.projected < hitDistance).slice(0, penetration)
      if (hits.length) hitDistance = hits[0].projected
      const end = { x: origin.x + dir.x * hitDistance, y: origin.y + dir.y * hitDistance }
      state.tracers.push({ x1: origin.x, y1: origin.y, x2: end.x, y2: end.y, life: 0.085, color: weapon.color })
      for (const hit of hits) {
        const critical = hit.perpendicular <= hit.enemy.r * 0.34
        const levelMultiplier = 1 + current.level * 0.55
        const damage = weapon.damage * levelMultiplier * (critical ? 1.8 : 1)
        this.damageEnemy(hit.enemy, damage, critical)
        if (weapon.chainRadius) {
          const chained = state.enemies.find(enemy => enemy !== hit.enemy && distance(enemy, hit.enemy) <= weapon.chainRadius)
          if (chained) this.damageEnemy(chained, damage * 0.4, false)
        }
        if (weapon.splashRadius) {
          for (const nearby of [...state.enemies]) if (nearby !== hit.enemy && distance(nearby, hit.enemy) <= weapon.splashRadius) this.damageEnemy(nearby, damage * 0.28, false)
        }
      }
    }
    this.particles(origin.x + Math.cos(origin.angle) * 28, origin.y + Math.sin(origin.angle) * 28, weapon.color, 4)
    this.sound(current.id === 'breach' ? 88 : 125, 0.035, 'sawtooth', 0.045)
  }

  damageEnemy(enemy, amount, critical) {
    const effective = Math.min(enemy.hp, amount)
    enemy.hp -= amount
    enemy.stagger = enemy.boss ? 0.025 : 0.08
    this.state.player.credits += Math.ceil(effective / 8) * (this.state.elapsed < this.state.power.doubleUntil ? 2 : 1)
    this.state.score += Math.round(effective * (critical ? 1.35 : 1))
    this.particles(enemy.x, enemy.y, critical ? '#ffd878' : '#b3233d', critical ? 7 : 3)
    if (enemy.hp <= 0) this.killEnemy(enemy, critical)
  }

  killEnemy(enemy, critical) {
    this.state.enemies = this.state.enemies.filter(item => item !== enemy)
    this.state.kills += 1
    this.state.combo += 1
    this.state.comboTimer = 2.4
    this.state.player.credits += (enemy.boss ? 1200 : critical ? 110 : 75) * (this.state.elapsed < this.state.power.doubleUntil ? 2 : 1)
    this.state.player.scrap += enemy.boss ? 8 : this.random() < 0.18 ? 1 : 0
    if (this.random() < 0.055 && !enemy.boss) this.spawnPickup(enemy.x, enemy.y)
    const stage = this.currentStage()
    if (stage?.type === 'kills' && distance(enemy, stage.area) <= stage.area.r) {
      this.state.quest.progress += 1
      if (this.state.quest.progress >= stage.target) this.advanceQuest()
    }
    if (enemy.boss) this.advanceQuest()
  }

  spawnPickup(x, y) {
    const roll = this.random()
    this.state.pickups.push({ id: this.state.nextId++, x, y, r: 13, kind: roll < 0.45 ? 'ammo' : roll < 0.78 ? 'heal' : 'double', life: 13 })
  }

  updatePickups(dt) {
    for (const pickup of this.state.pickups) {
      pickup.life -= dt
      if (distance(pickup, this.state.player) < 38) {
        if (pickup.kind === 'ammo') for (const weapon of this.state.player.weapons.filter(Boolean)) weapon.reserve += Math.ceil(WEAPONS[weapon.id].reserve * 0.22)
        if (pickup.kind === 'heal') this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + 48)
        if (pickup.kind === 'double') this.state.power.doubleUntil = this.state.elapsed + 18
        pickup.life = 0
        this.announce(pickup.kind === 'ammo' ? 'MUNICIÓN RECUPERADA' : pickup.kind === 'heal' ? 'PULSO VITAL' : 'DOBLE RESIDUO')
        this.sound(620, 0.12, 'sine')
      }
    }
    this.state.pickups = this.state.pickups.filter(item => item.life > 0)
  }

  damagePlayer(amount) {
    const player = this.state.player
    if (player.invulnerable > 0 || this.state.phase === 'gameover') return
    let remaining = amount
    if (player.armor > 0) { const absorbed = Math.min(player.armor, remaining); player.armor -= absorbed; remaining -= absorbed }
    player.hp -= remaining
    if (player.hp <= 0) {
      if (player.perks.includes('respiro') && !player.usedRevive) {
        player.usedRevive = true
        player.hp = Math.ceil(player.maxHp * 0.55)
        player.armor = 0
        player.invulnerable = 3
        player.perks = player.perks.filter(id => id !== 'respiro')
        this.announce('SEGUNDO ALIENTO', 3)
      } else this.gameOver()
    }
  }

  reload() {
    const current = this.currentWeapon()
    const weapon = WEAPONS[current.id]
    const capacity = weapon.magazine + current.level * Math.ceil(weapon.magazine * 0.2)
    if (current.reloading > 0 || current.ammo >= capacity || current.reserve <= 0) return
    current.reloading = weapon.reloadMs * (this.state.player.perks.includes('cobalto') ? 0.7 : 1)
  }

  interact() {
    if (this.state.phase !== 'active' && this.state.phase !== 'intermission') return
    const station = this.nearestStation()
    if (!station) return
    const lockedBy = this.stationGate(station)
    if (lockedBy && !this.state.gates[lockedBy.id]) return this.announce(`SECTOR SELLADO · ABRE ${lockedBy.name.toUpperCase()}`)
    if (station.type === 'perk') this.buyPerk(station.perk)
    else if (station.type === 'weapon') this.buyWeapon(station.weapon, station.cost)
    else if (station.type === 'forge') this.upgradeWeapon()
    else if (station.type === 'quest') this.activateQuestStation(station.id)
    else if (station.type === 'gate') this.openGate(station)
    else if (station.type === 'armory') this.useArmory()
    else if (station.type === 'trap') this.activateTrap()
    else if (station.type === 'extraction') this.startExtraction()
  }

  buyPerk(id) {
    const perk = PERKS[id], player = this.state.player
    if (!this.state.powerOnline) return this.announce('SIN ENERGÍA · REACTIVA LA RED')
    if (player.perks.includes(id)) return this.announce('DESTILADO YA ACTIVO')
    if (player.perks.length >= 4) return this.announce('LÍMITE DE 4 DESTILADOS')
    const cost = Math.round(perk.cost * (1 + player.perks.length * 0.18))
    if (player.credits < cost) return this.announce('RESIDUOS INSUFICIENTES')
    player.credits -= cost
    player.perks.push(id)
    if (id === 'respiro') player.usedRevive = false
    if (id === 'ferreo') { player.maxHp += 50; player.hp += 50 }
    this.announce(perk.name.toUpperCase())
    this.sound(480, 0.18, 'triangle')
  }

  buyWeapon(id, cost) {
    const player = this.state.player
    const current = this.currentWeapon()
    if (current.id === id) {
      const ammoCost = Math.round(cost * 0.35)
      if (player.credits < ammoCost) return this.announce('RESIDUOS INSUFICIENTES')
      player.credits -= ammoCost
      current.reserve = WEAPONS[id].reserve
      return this.announce('MUNICIÓN REPUESTA')
    }
    if (player.credits < cost) return this.announce('RESIDUOS INSUFICIENTES')
    player.credits -= cost
    const emptySlot = player.weapons.findIndex(item => !item)
    const slot = emptySlot >= 0 ? emptySlot : player.activeWeapon
    player.weapons[slot] = weaponState(id)
    player.activeWeapon = slot
    this.announce(WEAPONS[id].name.toUpperCase())
  }

  upgradeWeapon() {
    if (!this.state.powerOnline) return this.announce('SIN ENERGÍA · REACTIVA LA RED')
    const weapon = this.currentWeapon()
    if (weapon.level >= 3) return this.announce('ARMA AL MÁXIMO')
    const cost = SYSTEM_RULES.forgeCredits[weapon.level]
    const componentCost = SYSTEM_RULES.forgeComponents[weapon.level]
    if (this.state.player.credits < cost) return this.announce('RESIDUOS INSUFICIENTES')
    if (this.state.player.scrap < componentCost) return this.announce(`FALTAN ${componentCost} COMPONENTES`)
    this.state.player.credits -= cost
    this.state.player.scrap -= componentCost
    weapon.level += 1
    weapon.reserve += WEAPONS[weapon.id].magazine * 2
    this.announce(`FORJA · NIVEL ${weapon.level}`)
  }

  openGate(gate) {
    if (this.state.gates[gate.id]) return
    if (this.state.player.credits < gate.cost) return this.announce('RESIDUOS INSUFICIENTES')
    this.state.player.credits -= gate.cost
    this.state.gates[gate.id] = true
    this.announce(`${gate.name.toUpperCase()} · ACCESO ABIERTO`)
    this.sound(145, 0.35, 'sawtooth', 0.08)
  }

  useArmory() {
    if (!this.state.powerOnline) return this.announce('CONTRABANDO SIN ENERGÍA')
    const armory = this.state.armory
    if (armory.offer && this.state.elapsed < armory.expiresAt) {
      const id = armory.offer
      const player = this.state.player
      const emptySlot = player.weapons.findIndex(item => !item)
      const slot = emptySlot >= 0 ? emptySlot : player.activeWeapon
      player.weapons[slot] = weaponState(id); player.activeWeapon = slot
      armory.offer = null
      return this.announce(`${WEAPONS[id].name.toUpperCase()} · EQUIPADA`)
    }
    if (this.state.player.credits < this.map.armory.cost) return this.announce('RESIDUOS INSUFICIENTES')
    this.state.player.credits -= this.map.armory.cost
    const pool = SYSTEM_RULES.armoryPool.filter(id => !armory.history.slice(-2).includes(id))
    const id = pool[Math.floor(this.random() * pool.length)]
    armory.offer = id; armory.expiresAt = this.state.elapsed + 12; armory.history.push(id)
    this.announce(`OFERTA · ${WEAPONS[id].name.toUpperCase()} · PULSA E PARA RECOGER`, 3.6)
  }

  activateTrap() {
    const trap = this.map.trap, state = this.state
    if (!state.powerOnline) return this.announce('TRAMPA SIN ENERGÍA')
    if (state.elapsed < state.trap.cooldownUntil) return this.announce(`RECARGANDO · ${Math.ceil(state.trap.cooldownUntil - state.elapsed)} S`)
    if (state.player.credits < trap.cost || state.player.scrap < trap.componentCost) return this.announce(`REQUIERE ${trap.cost} RESIDUOS + ${trap.componentCost} COMPONENTES`)
    state.player.credits -= trap.cost; state.player.scrap -= trap.componentCost
    state.trap.activeUntil = state.elapsed + trap.duration
    state.trap.cooldownUntil = state.elapsed + trap.cooldown
    this.announce(`${trap.name.toUpperCase()} · ACTIVA`, 2.4)
  }

  updateTrap(dt) {
    const state = this.state, trap = this.map.trap
    if (state.elapsed >= state.trap.activeUntil) return
    for (const enemy of [...state.enemies]) {
      if (distance(enemy, trap) > trap.r) continue
      const damage = trap.effect === 'storm' ? 170 : trap.effect === 'root' ? 95 : 135
      if (trap.effect === 'root') enemy.stagger = Math.max(enemy.stagger, 0.08)
      this.damageEnemy(enemy, damage * dt, false)
    }
  }

  startExtraction() {
    const state = this.state
    if (!state.extraction.available || state.extraction.active) return
    state.extraction.active = true
    state.extraction.timer = 30
    state.phase = 'active'
    state.pendingSpawns += roundPlan(state.round).maxAlive
    state.spawnCooldown = 0
    this.announce('EXTRACCIÓN INICIADA · RESISTE 30 SEGUNDOS', 3.5)
  }

  updateExtraction(dt) {
    const state = this.state
    if (!state.extraction.active || state.phase !== 'active') return
    state.extraction.timer -= dt
    if (state.extraction.timer > 0) return
    state.extraction.active = false
    state.endReason = 'extracted'
    state.phase = 'gameover'
    this.announce('EXTRACCIÓN COMPLETADA', 10)
    this.publish()
    this.onGameOver(this.getSnapshot())
  }

  currentStage() { return this.map.quest[this.state.quest.stage] }
  isBossStage() { return this.currentStage()?.type === 'boss' }

  activateQuestStation(id) {
    const stage = this.currentStage()
    if (!stage) return
    if (stage.type === 'activate') {
      if (!stage.ids.includes(id) || this.state.quest.activated.includes(id)) return
      this.state.quest.activated.push(id)
      this.state.quest.progress += 1
      this.announce(`${stage.label} ${this.state.quest.progress}/${stage.ids.length}`)
      if (this.state.quest.progress >= stage.ids.length) this.advanceQuest()
    } else if (stage.type === 'sequence') {
      const expected = stage.ids[this.state.quest.progress]
      if (id === expected) {
        this.state.quest.progress += 1
        this.announce(`SEÑAL ${this.state.quest.progress}/${stage.ids.length}`)
        if (this.state.quest.progress >= stage.ids.length) this.advanceQuest()
      } else if (stage.ids.includes(id)) {
        this.state.quest.progress = 0
        this.announce('SECUENCIA ROTA · VUELVE A EMPEZAR')
      }
    } else if (stage.type === 'survive' && id === stage.id && !this.state.quest.started) {
      this.state.quest.started = true
      this.state.quest.timer = stage.seconds
      this.announce('DEFENSA INICIADA')
    }
  }

  updateQuest(dt) {
    const stage = this.currentStage()
    if (!stage || this.state.quest.completed) return
    if (stage.type === 'survive' && this.state.quest.started && this.state.phase === 'active') {
      const station = this.map.stations.find(item => item.id === stage.id)
      if (station && distance(station, this.state.player) > 150) return
      this.state.quest.timer -= dt
      this.state.quest.progress = Math.max(0, Math.ceil(stage.seconds - this.state.quest.timer))
      if (this.state.quest.timer <= 0) this.advanceQuest()
    }
    if (stage.type === 'boss' && !this.state.quest.bossSpawned) {
      this.state.quest.bossSpawned = true
      this.spawnBoss(stage.name)
    }
  }

  advanceQuest() {
    const finished = this.currentStage()
    const finishedStageIndex = this.state.quest.stage
    let powerRestored = false
    this.state.quest.stage += 1
    this.state.quest.progress = 0
    this.state.quest.activated = []
    this.state.quest.started = false
    this.state.quest.timer = 0
    this.state.quest.bossSpawned = false
    if (finishedStageIndex === 0 && !this.state.powerOnline) {
      this.state.powerOnline = true
      this.state.player.scrap += 2
      powerRestored = true
    }
    if (this.state.quest.stage >= this.map.quest.length) {
      this.state.quest.completed = true
      this.state.extraction.available = true
      this.state.player.credits += 5000
      this.state.score += 15000
      this.announce('PROTOCOLO DESCIFRADO · BALIZA DE EXTRACCIÓN ACTIVA', 6)
    } else {
      this.announce(powerRestored ? `${this.map.power.name.toUpperCase()} · ENERGÍA RESTAURADA` : finished?.type === 'boss' ? 'ANOMALÍA SELLADA' : 'SECRETO DESBLOQUEADO', powerRestored ? 4 : 3)
    }
  }

  updatePrompt() {
    const station = this.nearestStation()
    if (!station) { this.state.prompt = null; return }
    const lockedBy = this.stationGate(station)
    if (lockedBy && !this.state.gates[lockedBy.id]) { this.state.prompt = `SECTOR SELLADO · ${lockedBy.name}`; return }
    if (station.type === 'perk') {
      const perk = PERKS[station.perk]
      const cost = Math.round(perk.cost * (1 + this.state.player.perks.length * 0.18))
      this.state.prompt = this.state.powerOnline ? `E · ${perk.name} · ${cost}` : 'E · DESTILADOR SIN ENERGÍA'
    } else if (station.type === 'weapon') this.state.prompt = `E · ${WEAPONS[station.weapon].name} · ${station.cost}`
    else if (station.type === 'forge') {
      const weapon = this.currentWeapon(), componentCost = SYSTEM_RULES.forgeComponents[weapon.level] ?? 0
      const forgeCost = SYSTEM_RULES.forgeCredits[weapon.level]
      this.state.prompt = weapon.level >= 3 ? 'FORJA · ARMA AL MÁXIMO' : this.state.powerOnline ? `E · Forja · ${forgeCost}${componentCost ? ` + ${componentCost} comp.` : ''}` : 'E · FORJA SIN ENERGÍA'
    }
    else if (this.questStationActive(station.id)) this.state.prompt = `E · ${this.currentStage()?.label || 'INTERACTUAR'}`
    else if (station.type === 'gate') this.state.prompt = this.state.gates[station.id] ? null : `E · Abrir ${station.name} · ${station.cost}`
    else if (station.type === 'armory') {
      const offer = this.state.armory.offer && this.state.elapsed < this.state.armory.expiresAt ? WEAPONS[this.state.armory.offer].name : null
      this.state.prompt = !this.state.powerOnline ? 'E · CONTRABANDO SIN ENERGÍA' : offer ? `E · Recoger ${offer}` : `E · ${this.map.armory.name} · ${this.map.armory.cost}`
    } else if (station.type === 'trap') {
      const wait = Math.max(0, Math.ceil(this.state.trap.cooldownUntil - this.state.elapsed))
      this.state.prompt = !this.state.powerOnline ? 'E · TRAMPA SIN ENERGÍA' : wait ? `${this.map.trap.name} · ${wait} s` : `E · ${this.map.trap.name} · ${this.map.trap.cost} + ${this.map.trap.componentCost} comp.`
    } else if (station.type === 'extraction') this.state.prompt = this.state.extraction.active ? `EXTRACCIÓN · ${Math.ceil(this.state.extraction.timer)} s` : `E · ${this.map.extraction.name}`
    else this.state.prompt = null
  }

  questStationActive(id) {
    const stage = this.currentStage()
    if (!stage) return false
    if (stage.type === 'activate' || stage.type === 'sequence') return stage.ids.includes(id)
    return stage.type === 'survive' && stage.id === id
  }

  nearestStation() {
    let result = null, best = 72
    const systems = [
      ...this.map.gates.map(gate => ({ ...gate, type: 'gate', x: gate.x + gate.w / 2, y: gate.y + gate.h / 2 })),
      { ...this.map.armory, type: 'armory' }, { ...this.map.trap, type: 'trap' },
      ...(this.state.extraction.available ? [{ ...this.map.extraction, type: 'extraction' }] : []),
    ]
    for (const station of [...this.map.stations, ...systems]) {
      const gap = distance(station, this.state.player)
      if (gap < best && (station.type !== 'quest' || this.questStationActive(station.id))) { result = station; best = gap }
    }
    return result
  }

  stationGate(station) {
    if (station.type === 'gate') return null
    if (station.gate) return this.map.gates.find(gate => gate.id === station.gate) || null
    if (station.x < 430) return this.map.gates[0]
    if (station.x > 850) return this.map.gates[1]
    if (station.y < 300) return this.map.gates[2]
    return null
  }

  nearestEnemy() {
    let result = null, best = Infinity
    for (const enemy of this.state.enemies) { const gap = distance(enemy, this.state.player); if (gap < best) { best = gap; result = enemy } }
    return result
  }

  particles(x, y, color, count) {
    for (let i = 0; i < count; i += 1) this.state.particles.push({ x, y, vx: (this.random() - 0.5) * 150, vy: (this.random() - 0.5) * 150, life: 0.18 + this.random() * 0.2, color })
  }

  announce(message, duration = 2.2) { this.state.message = message; this.state.messageTimer = duration }

  gameOver() {
    this.state.phase = 'gameover'
    this.state.endReason = 'died'
    this.pointer.down = false
    this.announce('LA SEÑAL SE HA PERDIDO', 10)
    this.publish()
    this.onGameOver(this.getSnapshot())
  }

  togglePause() { this.pause(this.state.phase !== 'paused') }
  pause(value) {
    if (this.state.phase === 'gameover') return
    if (value && this.state.phase !== 'paused') { this.resumePhase = this.state.phase; this.state.phase = 'paused'; this.pointer.down = false }
    else if (!value && this.state.phase === 'paused') this.state.phase = this.resumePhase || 'active'
    this.publish()
  }

  setVirtual(action, active) { active ? this.virtual.add(action) : this.virtual.delete(action) }
  isDown(code, virtual) { return this.keys.has(code) || this.virtual.has(virtual) }

  onKeyDown(event) {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
    if (event.repeat && ['KeyE', 'KeyR', 'KeyQ', 'Digit1', 'Digit2', 'Escape', 'KeyP'].includes(event.code)) return
    this.keys.add(event.code)
    if (event.code === 'Space' && !event.repeat && this.state.phase === 'active') this.fire()
    if (event.code === 'KeyE') this.interact()
    if (event.code === 'KeyR') this.reload()
    if (event.code === 'KeyQ') this.switchWeapon()
    if (event.code === 'Digit1') this.switchWeapon(0)
    if (event.code === 'Digit2') this.switchWeapon(1)
    if (event.code === 'Escape' || event.code === 'KeyP') this.togglePause()
  }
  onKeyUp(event) { this.keys.delete(event.code) }
  pointerWorld(event) {
    const rect = this.canvas.getBoundingClientRect()
    const scale = Math.min(rect.width / WORLD.width, rect.height / WORLD.height)
    const drawnWidth = WORLD.width * scale
    const drawnHeight = WORLD.height * scale
    const offsetX = (rect.width - drawnWidth) / 2
    const offsetY = (rect.height - drawnHeight) / 2
    return {
      x: clamp((event.clientX - rect.left - offsetX) / scale, 0, WORLD.width),
      y: clamp((event.clientY - rect.top - offsetY) / scale, 0, WORLD.height),
    }
  }
  onPointerMove(event) { if (event.pointerType !== 'touch') Object.assign(this.pointer, this.pointerWorld(event), { active: true }) }
  onPointerDown(event) {
    if (event.target !== this.canvas) return
    this.ensureAudio()
    if (event.pointerType !== 'touch') {
      Object.assign(this.pointer, this.pointerWorld(event), { down: true, active: true })
      if (this.state.phase === 'active') this.fire()
    }
  }

  ensureAudio() {
    if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)()
    if (this.audio.state === 'suspended') this.audio.resume()
  }
  sound(frequency, duration, type = 'sine', volume = 0.06) {
    if (!this.audio) return
    const oscillator = this.audio.createOscillator(), gain = this.audio.createGain()
    oscillator.type = type; oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(volume, this.audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + duration)
    oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + duration)
  }

  getSnapshot() {
    const state = this.state, player = state.player, weapon = this.currentWeapon(), stage = this.currentStage()
    const secondary = player.weapons[player.activeWeapon === 0 ? 1 : 0]
    let questProgress = ''
    if (stage?.type === 'activate' || stage?.type === 'sequence') questProgress = `${state.quest.progress}/${stage.ids.length}`
    if (stage?.type === 'kills') questProgress = `${state.quest.progress}/${stage.target}`
    if (stage?.type === 'survive' && state.quest.started) questProgress = `${Math.ceil(state.quest.timer)} s`
    return {
      phase: state.phase, round: state.round, roundTimer: Math.max(0, Math.ceil(state.roundTimer)),
      hp: Math.max(0, Math.ceil(player.hp)), maxHp: player.maxHp, armor: Math.max(0, Math.ceil(player.armor)), maxArmor: player.maxArmor,
      playerX: player.x / WORLD.width * 100, playerY: player.y / WORLD.height * 100,
      credits: player.credits, scrap: player.scrap, score: state.score, kills: state.kills,
      ammo: weapon.ammo, reserve: weapon.reserve, weapon: WEAPONS[weapon.id].name, weaponLevel: weapon.level, reloading: weapon.reloading > 0,
      secondaryWeapon: secondary ? WEAPONS[secondary.id].name : 'Hueco vacío', secondaryAmmo: secondary?.ammo ?? null, secondaryReserve: secondary?.reserve ?? null, activeWeapon: player.activeWeapon + 1,
      weaponSlots: player.weapons.map(item => item ? { name: WEAPONS[item.id].name, ammo: item.ammo, reserve: item.reserve, level: item.level, reloading: item.reloading > 0 } : null),
      perks: player.perks, prompt: state.prompt, message: state.messageTimer > 0 ? state.message : '',
      objective: state.extraction.active ? `Defiende la baliza · ${Math.ceil(state.extraction.timer)} s` : state.quest.completed ? 'Misterio completado · activa la baliza en el mapa' : stage?.text || this.map.objective,
      questProgress, questStage: state.quest.stage + 1, questTotal: this.map.quest.length, questComplete: state.quest.completed,
      enemies: state.enemies.length, pending: state.pendingSpawns, combo: state.combo,
      double: state.elapsed < state.power.doubleUntil, mapName: this.map.name, seed: this.seed,
      powerOnline: state.powerOnline, gatesOpen: Object.values(state.gates).filter(Boolean).length, gatesTotal: this.map.gates.length,
      roundEvent: state.roundEvent?.name || '', trapActive: state.elapsed < state.trap.activeUntil,
      extractionActive: state.extraction.active, extractionTimer: Math.max(0, Math.ceil(state.extraction.timer)), endReason: state.endReason,
    }
  }
  publish() { this.onSnapshot(this.getSnapshot()) }

  render() {
    const ctx = this.ctx, ratio = this.pixelRatio || 1
    const width = this.canvas.width / ratio, height = this.canvas.height / ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#080a0c'; ctx.fillRect(0, 0, width, height)
    const scale = Math.min(width / WORLD.width, height / WORLD.height)
    const offsetX = (width - WORLD.width * scale) / 2, offsetY = (height - WORLD.height * scale) / 2
    ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(scale, scale)
    this.drawMap(ctx)
    this.drawWorld(ctx)
    ctx.restore()
  }

  drawMap(ctx) {
    const image = this.images.maps
    if (image.complete && image.naturalWidth) {
      const cellW = image.naturalWidth / 2, cellH = image.naturalHeight / 2
      const col = this.map.atlas % 2, row = Math.floor(this.map.atlas / 2)
      ctx.drawImage(image, col * cellW, row * cellH, cellW, cellH, 0, 0, WORLD.width, WORLD.height)
    } else { ctx.fillStyle = '#13201f'; ctx.fillRect(0, 0, WORLD.width, WORLD.height) }
    const gradient = ctx.createRadialGradient(WORLD.width / 2, WORLD.height / 2, 120, WORLD.width / 2, WORLD.height / 2, 780)
    gradient.addColorStop(0, 'rgba(6,13,15,.02)'); gradient.addColorStop(1, 'rgba(2,4,6,.68)')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WORLD.width, WORLD.height)
    if (this.state.roundEvent) {
      ctx.fillStyle = `${this.state.roundEvent.tint}18`
      ctx.fillRect(0, 0, WORLD.width, WORLD.height)
    }
  }

  drawWorld(ctx) {
    const state = this.state
    for (const hazard of this.map.hazards) {
      const pulse = 0.5 + Math.sin(state.elapsed * 2) * 0.18
      ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.r, 0, TAU)
      ctx.strokeStyle = hazard.kind === 'storm' ? `rgba(232,163,59,${pulse})` : hazard.kind === 'spore' ? `rgba(154,93,224,${pulse})` : `rgba(52,181,178,${pulse})`
      ctx.lineWidth = 3; ctx.stroke()
    }
    for (const rect of this.map.obstacles) {
      ctx.fillStyle = 'rgba(2,4,5,.22)'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      ctx.strokeStyle = 'rgba(219,225,214,.12)'; ctx.lineWidth = 1; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)
    }
    this.drawSystems(ctx)
    this.drawStations(ctx)
    for (const pickup of state.pickups) this.drawPickup(ctx, pickup)
    for (const tracer of state.tracers) {
      ctx.globalAlpha = clamp(tracer.life / 0.085, 0, 1); ctx.strokeStyle = tracer.color; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(tracer.x1, tracer.y1); ctx.lineTo(tracer.x2, tracer.y2); ctx.stroke(); ctx.globalAlpha = 1
    }
    for (const enemy of state.enemies) this.drawEnemy(ctx, enemy)
    this.drawPlayer(ctx, state.player)
    for (const particle of state.particles) { ctx.globalAlpha = clamp(particle.life * 4, 0, 1); ctx.fillStyle = particle.color; ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4) }
    ctx.globalAlpha = 1
  }

  drawStations(ctx) {
    const stage = this.currentStage()
    for (const station of this.map.stations) {
      if (station.type === 'perk') {
        const perk = PERKS[station.perk]
        this.drawSprite(ctx, 3, perk.sprite, station.x, station.y, 58, 58)
        ctx.beginPath(); ctx.arc(station.x, station.y, 33 + Math.sin(this.state.elapsed * 2) * 2, 0, TAU); ctx.strokeStyle = perk.color; ctx.lineWidth = 2; ctx.stroke()
      } else if (station.type === 'weapon' || station.type === 'forge') {
        ctx.save(); ctx.translate(station.x, station.y); ctx.fillStyle = station.type === 'forge' ? '#e8a33b' : '#d7ddd5'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 3; ctx.strokeRect(-20, -15, 40, 30); ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.stroke(); ctx.restore()
      } else if (station.type === 'quest' && this.questStationActive(station.id)) {
        const complete = this.state.quest.activated.includes(station.id)
        ctx.save(); ctx.translate(station.x, station.y); ctx.rotate(this.state.elapsed * 0.8)
        ctx.strokeStyle = complete ? '#5fd084' : this.map.danger; ctx.lineWidth = 3; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14
        ctx.strokeRect(-12, -12, 24, 24); ctx.restore()
      }
    }
    if (stage?.type === 'kills') {
      ctx.beginPath(); ctx.arc(stage.area.x, stage.area.y, stage.area.r, 0, TAU); ctx.strokeStyle = `${this.map.accent}99`; ctx.setLineDash([9, 9]); ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([])
    }
  }

  drawSystems(ctx) {
    const state = this.state
    for (const gate of this.map.gates) {
      if (state.gates[gate.id]) continue
      ctx.fillStyle = 'rgba(219,52,72,.17)'; ctx.fillRect(gate.x, gate.y, gate.w, gate.h)
      ctx.strokeStyle = 'rgba(255,115,130,.8)'; ctx.lineWidth = 2; ctx.strokeRect(gate.x, gate.y, gate.w, gate.h)
      for (let line = gate.y + 8; line < gate.y + gate.h; line += 16) {
        ctx.beginPath(); ctx.moveTo(gate.x, line); ctx.lineTo(gate.x + gate.w, line - 8); ctx.stroke()
      }
      this.drawSystemSprite(ctx, 0, 0, gate.x + gate.w / 2, gate.y + gate.h / 2, 92, 70)
    }
    this.drawSystemSprite(ctx, 0, 1, this.map.power.x, this.map.power.y, 76, 76)
    ctx.beginPath(); ctx.arc(this.map.power.x, this.map.power.y, 42, 0, TAU)
    ctx.strokeStyle = state.powerOnline ? '#61e6dc' : '#8c3a40'; ctx.lineWidth = 3; ctx.stroke()
    this.drawSystemSprite(ctx, 0, 2, this.map.armory.x, this.map.armory.y, 86, 86)
    const trapCol = this.map.atlas
    this.drawSystemSprite(ctx, 1, trapCol, this.map.trap.x, this.map.trap.y, 84, 84)
    ctx.beginPath(); ctx.arc(this.map.trap.x, this.map.trap.y, this.map.trap.r, 0, TAU)
    ctx.strokeStyle = state.elapsed < state.trap.activeUntil ? '#79f5ed' : 'rgba(232,163,59,.35)'
    ctx.lineWidth = state.elapsed < state.trap.activeUntil ? 5 : 2
    ctx.setLineDash(state.elapsed < state.trap.activeUntil ? [] : [8, 12]); ctx.stroke(); ctx.setLineDash([])
    if (state.elapsed < state.trap.activeUntil) {
      ctx.fillStyle = 'rgba(82,199,242,.12)'; ctx.fill()
    }
    if (state.armory.offer && state.elapsed < state.armory.expiresAt) {
      const weaponIndex = { prism: 0, mercury: 1, solar: 2 }[state.armory.offer]
      if (weaponIndex !== undefined) this.drawSystemSprite(ctx, 3, weaponIndex, this.map.armory.x, this.map.armory.y - 58, 74, 46)
      ctx.strokeStyle = '#e8a33b'; ctx.lineWidth = 3; ctx.strokeRect(this.map.armory.x - 42, this.map.armory.y - 42, 84, 84)
    }
    if (state.extraction.available) {
      this.drawSystemSprite(ctx, 1, 3, this.map.extraction.x, this.map.extraction.y, 86, 86)
      ctx.beginPath(); ctx.arc(this.map.extraction.x, this.map.extraction.y, 48 + Math.sin(state.elapsed * 3) * 4, 0, TAU)
      ctx.strokeStyle = state.extraction.active ? '#e8a33b' : '#61e6dc'; ctx.lineWidth = 3; ctx.stroke()
    }
  }

  drawSprite(ctx, row, col, x, y, w, h, angle = 0) {
    const image = this.images.sprites
    if (!image.complete || !image.naturalWidth) return false
    const cellW = image.naturalWidth / 4, cellH = image.naturalHeight / 4
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
    ctx.drawImage(image, col * cellW, row * cellH, cellW, cellH, -w / 2, -h / 2, w, h)
    ctx.restore(); return true
  }

  drawSystemSprite(ctx, row, col, x, y, w, h, angle = 0) {
    const image = this.images.systems
    if (!image.complete || !image.naturalWidth) return false
    const cellW = image.naturalWidth / 4, cellH = image.naturalHeight / 4
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
    ctx.drawImage(image, col * cellW, row * cellH, cellW, cellH, -w / 2, -h / 2, w, h)
    ctx.restore(); return true
  }

  drawPlayer(ctx, player) {
    const col = directionColumn(player.angle)
    ctx.globalAlpha = player.invulnerable > 0 && Math.sin(this.state.elapsed * 18) > 0 ? 0.35 : 1
    if (!this.drawSprite(ctx, 0, col, player.x, player.y - 9, 72, 72)) { ctx.fillStyle = '#e8e1d4'; ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, TAU); ctx.fill() }
    ctx.globalAlpha = 1
    ctx.strokeStyle = this.map.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(player.angle) * 42, player.y + Math.sin(player.angle) * 42); ctx.stroke()
  }

  drawEnemy(ctx, enemy) {
    let row = 1, col = directionColumn(enemy.angle), size = enemy.r * 3.4
    if (enemy.boss) {
      this.drawSystemSprite(ctx, 2, this.map.atlas, enemy.x, enemy.y - 18, 120, 120)
    } else if (enemy.type === 'brute') { row = 2; col = 0; size = 88 }
    else if (enemy.type === 'specter') { row = 2; col = 3; size = 64 }
    else if (enemy.type === 'runner') { row = 2; col = 1; size = 61 }
    if (!enemy.boss) this.drawSprite(ctx, row, col, enemy.x, enemy.y - enemy.r * 0.45, size, size)
    if (enemy.boss || enemy.hp < enemy.maxHp) {
      const width = enemy.boss ? 88 : 34
      ctx.fillStyle = 'rgba(0,0,0,.68)'; ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.r - 18, width, 5)
      ctx.fillStyle = enemy.boss ? '#e8a33b' : '#b3233d'; ctx.fillRect(enemy.x - width / 2, enemy.y - enemy.r - 18, width * clamp(enemy.hp / enemy.maxHp, 0, 1), 5)
    }
  }

  drawPickup(ctx, pickup) {
    const colors = { ammo: '#64d6d1', heal: '#77d96f', double: '#e8a33b' }
    ctx.save(); ctx.translate(pickup.x, pickup.y); ctx.rotate(this.state.elapsed * 1.8); ctx.fillStyle = colors[pickup.kind]; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18; ctx.fillRect(-9, -9, 18, 18); ctx.restore()
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    window.removeEventListener('keydown', this.bound.keydown)
    window.removeEventListener('keyup', this.bound.keyup)
    window.removeEventListener('pointerup', this.bound.pointerup)
    window.removeEventListener('blur', this.bound.blur)
    this.canvas.removeEventListener('pointermove', this.bound.pointermove)
    this.canvas.removeEventListener('pointerdown', this.bound.pointerdown)
    this.audio?.close().catch(() => {})
  }
}

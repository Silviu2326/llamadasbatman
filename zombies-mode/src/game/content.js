export const WORLD = Object.freeze({ width: 1280, height: 720 })

export const SYSTEM_RULES = Object.freeze({
  armoryPool: Object.freeze(['rust', 'breach', 'umbral', 'prism', 'mercury', 'solar']),
  forgeCredits: Object.freeze([3500, 6500, 9500]),
  forgeComponents: Object.freeze([0, 3, 4]),
})

export const WEAPONS = Object.freeze({
  service: { name: 'Pistola de servicio', damage: 38, fireMs: 260, magazine: 12, reserve: 96, reloadMs: 1150, spread: 0.025, pellets: 1, range: 620, color: '#e8e1d4' },
  rust: { name: 'Subfusil Óxido', damage: 23, fireMs: 92, magazine: 32, reserve: 192, reloadMs: 1550, spread: 0.085, pellets: 1, range: 510, color: '#60d5cf' },
  breach: { name: 'Escopeta Brecha', damage: 18, fireMs: 690, magazine: 8, reserve: 64, reloadMs: 1850, spread: 0.24, pellets: 8, range: 335, color: '#e8a33b' },
  umbral: { name: 'Carabina Umbral', damage: 56, fireMs: 215, magazine: 24, reserve: 144, reloadMs: 1680, spread: 0.018, pellets: 1, range: 760, color: '#a8d8ff' },
  prism: { name: 'Aguja Prisma', damage: 68, fireMs: 180, magazine: 20, reserve: 140, reloadMs: 1650, spread: 0.012, pellets: 1, range: 820, penetration: 3, rarity: 'rara', color: '#bd8cff' },
  mercury: { name: 'Coro de Mercurio', damage: 26, fireMs: 78, magazine: 40, reserve: 240, reloadMs: 1820, spread: 0.07, pellets: 1, range: 540, chainRadius: 115, rarity: 'rara', color: '#61e6dc' },
  solar: { name: 'Mortaja Solar', damage: 22, fireMs: 720, magazine: 9, reserve: 72, reloadMs: 2050, spread: 0.21, pellets: 9, range: 370, splashRadius: 82, rarity: 'épica', color: '#ffb34d' },
})

export const PERKS = Object.freeze({
  ferreo: { name: 'Destilado Férreo', short: 'Férreo', cost: 2200, color: '#6bd66b', description: '+50 de salud máxima', sprite: 0 },
  cobalto: { name: 'Cadencia Cobalto', short: 'Cobalto', cost: 2600, color: '#52c7f2', description: 'Recargas un 30% más rápido', sprite: 1 },
  vector: { name: 'Vector Ámbar', short: 'Vector', cost: 2800, color: '#f0aa37', description: '+15% de velocidad', sprite: 2 },
  respiro: { name: 'Segundo Aliento', short: 'Aliento', cost: 3400, color: '#e85555', description: 'Una autorreanimación', sprite: 3 },
})

const commonStations = [
  { id: 'perk-ferreo', type: 'perk', perk: 'ferreo', x: 1110, y: 170 },
  { id: 'perk-cobalto', type: 'perk', perk: 'cobalto', x: 1110, y: 320 },
  { id: 'perk-vector', type: 'perk', perk: 'vector', x: 1110, y: 470 },
  { id: 'perk-respiro', type: 'perk', perk: 'respiro', x: 1110, y: 610 },
  { id: 'weapon-rust', type: 'weapon', weapon: 'rust', cost: 1350, x: 188, y: 102 },
  { id: 'weapon-breach', type: 'weapon', weapon: 'breach', cost: 1750, x: 990, y: 600 },
  { id: 'weapon-umbral', type: 'weapon', weapon: 'umbral', cost: 2100, x: 635, y: 92 },
  { id: 'forge', type: 'forge', cost: 3500, x: 650, y: 635 },
]

const edges = [
  { x: 28, y: 92 }, { x: 28, y: 360 }, { x: 28, y: 650 },
  { x: 1252, y: 92 }, { x: 1252, y: 360 }, { x: 1252, y: 650 },
  { x: 250, y: 28 }, { x: 650, y: 28 }, { x: 1030, y: 28 },
  { x: 250, y: 692 }, { x: 650, y: 692 }, { x: 1030, y: 692 },
]

export const MAPS = Object.freeze([
  {
    id: 'terminal-cero', name: 'Terminal Cero', subtitle: 'Metro clausurado · dificultad media', atlas: 0,
    accent: '#34b5b2', danger: '#b3233d', playerSpawn: { x: 640, y: 530 },
    objective: 'Reúne los fusibles y reactiva la red',
    obstacles: [
      { x: 42, y: 116, w: 260, h: 105 }, { x: 90, y: 470, w: 240, h: 86 },
      { x: 930, y: 65, w: 230, h: 78 }, { x: 960, y: 500, w: 160, h: 70 },
      { x: 505, y: 252, w: 82, h: 46 }, { x: 715, y: 252, w: 82, h: 46 },
    ],
    hazards: [{ x: 635, y: 355, r: 76, kind: 'seal' }], spawns: edges,
    gates: [
      { id: 'gate-west', name: 'Taller Oeste', cost: 750, x: 560, y: 430, w: 24, h: 180 },
      { id: 'gate-east', name: 'Andén Este', cost: 1000, x: 880, y: 355, w: 24, h: 180 },
      { id: 'gate-core', name: 'Control de Red', cost: 1250, x: 628, y: 205, w: 24, h: 95 },
    ],
    power: { name: 'Red ferroviaria', requirements: ['fuse-a', 'fuse-b', 'fuse-c'], x: 640, y: 360 },
    trap: { id: 'rail-shear', name: 'Cizalla de Raíl', effect: 'shock', cost: 1100, componentCost: 2, gate: 'gate-core', x: 760, y: 430, r: 120, duration: 11, cooldown: 36 },
    armory: { id: 'contraband-terminal', name: 'Contrabando Inestable', cost: 950, gate: 'gate-east', x: 1040, y: 350 },
    extraction: { id: 'extract-terminal', name: 'Baliza del último convoy', gate: 'gate-east', x: 1180, y: 650 },
    event: { id: 'blackout', name: 'Apagón de convoy', every: 5, enemy: 'runner', tint: '#d63b4f' },
    boss: { name: 'El Revisor', behavior: 'warden', summon: 'runner', color: '#e8a33b' },
    stations: [...commonStations,
      { id: 'fuse-a', type: 'quest', x: 136, y: 600 }, { id: 'fuse-b', type: 'quest', x: 1185, y: 185 }, { id: 'fuse-c', type: 'quest', x: 615, y: 155 },
      { id: 'radio-a', type: 'quest', x: 235, y: 340 }, { id: 'radio-b', type: 'quest', x: 1030, y: 375 }, { id: 'radio-c', type: 'quest', x: 650, y: 585 },
      { id: 'core', type: 'quest', x: 640, y: 360 },
    ],
    quest: [
      { type: 'activate', ids: ['fuse-a', 'fuse-b', 'fuse-c'], text: 'Recupera los 3 fusibles', label: 'FUSIBLE' },
      { type: 'sequence', ids: ['radio-b', 'radio-a', 'radio-c'], text: 'Las agujas del andén recuerdan el orden', label: 'RADIO' },
      { type: 'kills', target: 10, area: { x: 640, y: 360, r: 145 }, text: 'Carga el sello central con bajas cercanas' },
      { type: 'survive', seconds: 24, id: 'core', text: 'Activa y defiende el núcleo durante 24 s', label: 'NÚCLEO' },
      { type: 'boss', name: 'El Revisor', text: 'Derrota al Revisor de Andenes' },
    ],
  },
  {
    id: 'observatorio-ceniza', name: 'Observatorio Ceniza', subtitle: 'Azotea en tormenta · dificultad alta', atlas: 1,
    accent: '#82b7df', danger: '#e8a33b', playerSpawn: { x: 640, y: 560 },
    objective: 'Alinea los espejos antes del eclipse',
    obstacles: [
      { x: 70, y: 100, w: 185, h: 92 }, { x: 1025, y: 100, w: 185, h: 92 },
      { x: 68, y: 515, w: 180, h: 90 }, { x: 1032, y: 515, w: 180, h: 90 },
      { x: 535, y: 290, w: 210, h: 105 }, { x: 302, y: 238, w: 92, h: 52 }, { x: 886, y: 238, w: 92, h: 52 },
    ],
    hazards: [{ x: 320, y: 365, r: 55, kind: 'storm' }, { x: 960, y: 365, r: 55, kind: 'storm' }], spawns: edges,
    gates: [
      { id: 'gate-optics', name: 'Ala Óptica', cost: 800, x: 530, y: 430, w: 24, h: 155 },
      { id: 'gate-archive', name: 'Archivo Climático', cost: 1050, x: 866, y: 425, w: 24, h: 155 },
      { id: 'gate-dome', name: 'Cúpula', cost: 1400, x: 628, y: 400, w: 24, h: 95 },
    ],
    power: { name: 'Conductor celeste', requirements: ['mirror-a', 'mirror-b', 'mirror-c'], x: 640, y: 450 },
    trap: { id: 'sky-conductor', name: 'Conductor Celeste', effect: 'storm', cost: 1250, componentCost: 2, gate: 'gate-archive', x: 760, y: 480, r: 126, duration: 10, cooldown: 39 },
    armory: { id: 'contraband-observatory', name: 'Oráculo de Ceniza', cost: 950, gate: 'gate-dome', x: 845, y: 115 },
    extraction: { id: 'extract-observatory', name: 'Baliza del cielo muerto', gate: 'gate-archive', x: 1180, y: 650 },
    event: { id: 'glass-rain', name: 'Lluvia de vidrio', every: 5, enemy: 'specter', tint: '#82b7df' },
    boss: { name: 'El Cartógrafo', behavior: 'cartographer', summon: 'specter', color: '#82b7df' },
    stations: [...commonStations.map(station => station.id === 'perk-ferreo' ? { ...station, x: 1180, y: 235 } : station.id === 'weapon-rust' ? { ...station, x: 300, y: 105 } : station),
      { id: 'mirror-a', type: 'quest', x: 150, y: 250 }, { id: 'mirror-b', type: 'quest', x: 1130, y: 250 }, { id: 'mirror-c', type: 'quest', x: 640, y: 120 },
      { id: 'tape-a', type: 'quest', x: 320, y: 620 }, { id: 'tape-b', type: 'quest', x: 960, y: 620 }, { id: 'tape-c', type: 'quest', x: 640, y: 470 },
      { id: 'dome', type: 'quest', x: 640, y: 450 },
    ],
    quest: [
      { type: 'activate', ids: ['mirror-a', 'mirror-b', 'mirror-c'], text: 'Alinea los 3 espejos', label: 'ESPEJO' },
      { type: 'activate', ids: ['tape-a', 'tape-b', 'tape-c'], text: 'Recupera las 3 cintas de tormenta', label: 'CINTA' },
      { type: 'sequence', ids: ['mirror-c', 'mirror-a', 'mirror-b'], text: 'La constelación empieza donde nace la tormenta', label: 'CONSTELACIÓN' },
      { type: 'kills', target: 12, area: { x: 640, y: 480, r: 125 }, text: 'Sobrevive al eclipse bajo la cúpula' },
      { type: 'boss', name: 'El Cartógrafo', text: 'Destruye al Cartógrafo Hueco' },
    ],
  },
  {
    id: 'jardines-ultima-luz', name: 'Jardines de la Última Luz', subtitle: 'Bóveda botánica · dificultad extrema', atlas: 2,
    accent: '#8dd05a', danger: '#9a5de0', playerSpawn: { x: 640, y: 600 },
    objective: 'Despierta la semilla de luz',
    obstacles: [
      { x: 55, y: 75, w: 245, h: 125 }, { x: 980, y: 75, w: 245, h: 125 },
      { x: 55, y: 510, w: 245, h: 125 }, { x: 980, y: 510, w: 245, h: 125 },
      { x: 490, y: 260, w: 300, h: 160 }, { x: 335, y: 320, w: 80, h: 80 }, { x: 865, y: 320, w: 80, h: 80 },
    ],
    hazards: [{ x: 390, y: 205, r: 62, kind: 'spore' }, { x: 890, y: 205, r: 62, kind: 'spore' }], spawns: edges,
    gates: [
      { id: 'gate-herbarium', name: 'Herbario Negro', cost: 900, x: 530, y: 430, w: 24, h: 160 },
      { id: 'gate-canal', name: 'Canal Húmedo', cost: 1150, x: 842, y: 450, w: 24, h: 160 },
      { id: 'gate-sanctuary', name: 'Santuario Solar', cost: 1500, x: 628, y: 420, w: 24, h: 100 },
    ],
    power: { name: 'Biorreactor solar', requirements: ['seed'], x: 640, y: 500 },
    trap: { id: 'root-flower', name: 'Flor de Raíz', effect: 'root', cost: 1350, componentCost: 3, gate: 'gate-sanctuary', x: 760, y: 470, r: 132, duration: 12, cooldown: 42 },
    armory: { id: 'contraband-garden', name: 'Semillero Prohibido', cost: 950, gate: 'gate-canal', x: 840, y: 625 },
    extraction: { id: 'extract-garden', name: 'Baliza del amanecer', gate: 'gate-sanctuary', x: 640, y: 650 },
    event: { id: 'red-bloom', name: 'Floración Carmesí', every: 5, enemy: 'runner', tint: '#9a5de0' },
    boss: { name: 'El Jardinero Hueco', behavior: 'gardener', summon: 'standard', color: '#9a5de0' },
    stations: [...commonStations.map(station => {
      if (station.id === 'perk-ferreo') return { ...station, x: 1170, y: 250 }
      if (station.id === 'perk-respiro') return { ...station, x: 1180, y: 455 }
      if (station.id === 'weapon-rust') return { ...station, x: 330, y: 110 }
      if (station.id === 'weapon-breach') return { ...station, x: 940, y: 655 }
      return station
    }),
      { id: 'seed', type: 'quest', x: 640, y: 490 }, { id: 'vane-a', type: 'quest', x: 165, y: 280 }, { id: 'vane-b', type: 'quest', x: 1115, y: 280 }, { id: 'vane-c', type: 'quest', x: 640, y: 110 },
      { id: 'spectrum-a', type: 'quest', x: 340, y: 610 }, { id: 'spectrum-b', type: 'quest', x: 940, y: 610 }, { id: 'spectrum-c', type: 'quest', x: 640, y: 205 },
      { id: 'solar-key', type: 'quest', x: 640, y: 500 },
    ],
    quest: [
      { type: 'activate', ids: ['seed'], text: 'Despierta la Semilla Opaca', label: 'SEMILLA' },
      { type: 'sequence', ids: ['vane-b', 'vane-c', 'vane-a'], text: 'Las veletas siguen una luz que no existe', label: 'VELETA' },
      { type: 'activate', ids: ['spectrum-a', 'spectrum-b', 'spectrum-c'], text: 'Captura los 3 espectros de luz', label: 'ESPECTRO' },
      { type: 'survive', seconds: 28, id: 'solar-key', text: 'Cultiva y defiende la Llave Solar', label: 'LLAVE SOLAR' },
      { type: 'boss', name: 'El Jardinero Hueco', text: 'Derrota al Jardinero Hueco' },
    ],
  },
])

export function roundPlan(round) {
  return {
    count: Math.min(7 + Math.floor(round * 2.7 + Math.pow(round, 1.18)), 105),
    hp: Math.min(Math.round(72 * Math.pow(1.13, round - 1)), 3200),
    speed: Math.min(52 + round * 2.7, 108),
    maxAlive: Math.min(7 + Math.floor(round / 2), 26),
    interval: Math.max(310, 1050 - round * 38),
  }
}

export function normalizeSpawn(point, radius) {
  return {
    x: Math.max(radius + 10, Math.min(WORLD.width - radius - 10, point.x)),
    y: Math.max(radius + 10, Math.min(WORLD.height - radius - 10, point.y)),
    r: radius,
  }
}

export function spawnFits(map, point, radius) {
  const candidate = normalizeSpawn(point, radius)
  return !map.obstacles.some(rect => {
    const x = Math.max(rect.x, Math.min(rect.x + rect.w, candidate.x))
    const y = Math.max(rect.y, Math.min(rect.y + rect.h, candidate.y))
    return Math.hypot(candidate.x - x, candidate.y - y) < radius
  })
}

#!/usr/bin/env node
/**
 * Barrido de prospección de la campaña de EE. UU.
 *
 * Recorre la matriz sector × ciudad contra Google Places, deduplica por
 * placeId y deja el payload listo para `POST /api/prospects/import`.
 *
 * Existe por una razón concreta: Places Text Search **no pagina** en este
 * servicio y devuelve como mucho 20 resultados por consulta. Para cubrir un
 * mercado hay que repetir la consulta variando sector y ciudad, y hay que saber
 * cuántas consultas saturan el techo — una ciudad que devuelve 20 de 20 tiene
 * más negocios que no estamos viendo y hay que partirla por barrios.
 *
 * Por defecto no llama a nadie: enseña el plan y lo que costaría. Hay que
 * confirmar con --run.
 *
 * Uso:
 *   node --env-file=.env --import=tsx scripts/prospect-usa.ts agencies
 *   node --env-file=.env --import=tsx scripts/prospect-usa.ts roofers --run
 *   node --env-file=.env --import=tsx scripts/prospect-usa.ts agencies --run --out lista.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { searchProspects, stateFromAddress, type Prospect } from '../src/services/prospecting.service'

/** Techo real de Places en `searchProspects`. Saturarlo significa cobertura incompleta. */
const PER_QUERY_CAP = 20
/** Precio orientativo por consulta de Text Search, para la estimación previa. */
const COST_PER_QUERY_USD = 0.032

/**
 * Costa Este. Sin Florida ni Oklahoma: son los dos estados con más litigio
 * TCPA y la costa da de sobra sin ellos (MODOS_LEGALES_AGENTE_VOZ.md §6).
 * El estado va aparte del nombre porque es lo que fija la zona horaria del
 * lead, y sin zona horaria `canCall` no marca.
 */
const CITIES: Array<{ city: string; state: string }> = [
  { city: 'New York', state: 'NY' }, { city: 'Brooklyn', state: 'NY' },
  { city: 'Albany', state: 'NY' }, { city: 'Syracuse', state: 'NY' },
  { city: 'Newark', state: 'NJ' }, { city: 'Jersey City', state: 'NJ' },
  { city: 'Philadelphia', state: 'PA' }, { city: 'Pittsburgh', state: 'PA' },
  { city: 'Boston', state: 'MA' }, { city: 'Worcester', state: 'MA' },
  { city: 'Providence', state: 'RI' },
  { city: 'Hartford', state: 'CT' }, { city: 'Stamford', state: 'CT' },
  { city: 'Baltimore', state: 'MD' },
  { city: 'Washington', state: 'DC' },
  { city: 'Richmond', state: 'VA' }, { city: 'Virginia Beach', state: 'VA' },
  { city: 'Raleigh', state: 'NC' }, { city: 'Charlotte', state: 'NC' },
  { city: 'Greensboro', state: 'NC' }, { city: 'Durham', state: 'NC' },
  { city: 'Columbia', state: 'SC' }, { city: 'Charleston', state: 'SC' },
  { city: 'Atlanta', state: 'GA' }, { city: 'Savannah', state: 'GA' },
  { city: 'Augusta', state: 'GA' },
  { city: 'Wilmington', state: 'DE' },
  { city: 'Portland', state: 'ME' },
  { city: 'Manchester', state: 'NH' },
  { city: 'Burlington', state: 'VT' },
]

/**
 * Varios términos por pista: cada uno es una consulta distinta y Places
 * devuelve conjuntos que solo se solapan en parte. Es la única forma de pasar
 * del techo de 20 por ciudad.
 */
const TRACKS: Record<string, { label: string; sectors: string[] }> = {
  agencies: {
    label: 'Producto C · agencias de marketing (marca blanca)',
    sectors: ['marketing agency', 'web design company', 'digital agency', 'advertising agency', 'seo agency'],
  },
  roofers: {
    label: 'Producto A · techadores',
    sectors: ['roofing contractor', 'roofer', 'roof repair company'],
  },
}

const [, , rawTrack = '', ...rest] = process.argv
const track = TRACKS[rawTrack.trim().toLowerCase()]
const run = rest.includes('--run')
const flag = (name: string): string | null => {
  const index = rest.indexOf(name)
  return index >= 0 ? (rest[index + 1] ?? null) : null
}
const outFile = flag('--out') ?? `prospects-${rawTrack}.json`
const areasFile = flag('--areas')

if (!track) {
  console.error(
    `Uso: node --env-file=.env --import=tsx scripts/prospect-usa.ts <${Object.keys(TRACKS).join('|')}>` +
      ' [--run] [--out fichero.json] [--areas zonas.json]'
  )
  process.exit(1)
}

/**
 * Segunda pasada por barrios. Cuando una consulta satura el techo de 20, esa
 * ciudad tiene negocios que no vemos; se vuelve a barrer con sus zonas
 * ("Manhattan NY", "Queens NY"…) en lugar de con el municipio entero.
 * El fichero es un JSON de [{ "city": "...", "state": "XX" }].
 */
function loadAreas(path: string): Array<{ city: string; state: string }> {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  const rows = Array.isArray(parsed) ? parsed : parsed?.areas
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${path} no contiene una lista de zonas.`)
  return rows.map((row: { city?: unknown; state?: unknown }, index: number) => {
    const city = String(row?.city ?? '').trim()
    const state = String(row?.state ?? '').trim().toUpperCase()
    if (!city || state.length !== 2) throw new Error(`Zona ${index + 1} inválida: hacen falta "city" y "state" de dos letras.`)
    return { city, state }
  })
}

let areas = CITIES
if (areasFile) {
  try {
    areas = loadAreas(areasFile)
  } catch (error) {
    console.error(`\nNo se pudo leer ${areasFile}: ${(error as Error).message}\n`)
    process.exit(1)
  }
}

const queries = track.sectors.length * areas.length

type Row = Prospect & { sector: string; city: string; state: string }

// El tsconfig compila a CJS, así que nada de await en el nivel superior.
async function main() {
console.log(`\n${track.label}\n`)
console.log(`  ${track.sectors.length} términos × ${areas.length} ${areasFile ? `zonas de ${areasFile}` : 'ciudades'} = ${queries} consultas`)
console.log(`  Techo de Places: ${PER_QUERY_CAP} por consulta → máximo teórico ${queries * PER_QUERY_CAP} resultados`)
console.log(`  Coste estimado: ${(queries * COST_PER_QUERY_USD).toFixed(2)} $ (antes de duplicados)\n`)

if (!run) {
  console.log('Esto es solo el plan. Añade --run para ejecutarlo de verdad.\n')
  return
}

if (!process.env.GOOGLE_PLACES_API_KEY) {
  console.error('Falta GOOGLE_PLACES_API_KEY. Compruébalo con: npm run preflight:usa\n')
  process.exitCode = 1
  return
}

const byPlaceId = new Map<string, Row>()
const saturated: string[] = []
const saturatedAreas = new Map<string, { city: string; state: string }>()
const failed: string[] = []
let done = 0

for (const sector of track.sectors) {
  for (const { city, state } of areas) {
    const label = `${sector} · ${city} ${state}`
    done += 1
    try {
      const found = await searchProspects({ sector, city: `${city}, ${state}`, country: 'US', limit: PER_QUERY_CAP })
      let fresh = 0
      for (const prospect of found) {
        if (byPlaceId.has(prospect.placeId)) continue
        byPlaceId.set(prospect.placeId, {
          ...prospect,
          sector,
          city,
          // La dirección manda; la ciudad de la consulta es el respaldo, porque
          // Places devuelve negocios de municipios vecinos.
          state: stateFromAddress(prospect.address) ?? state,
        })
        fresh += 1
      }
      if (found.length >= PER_QUERY_CAP) {
        saturated.push(label)
        saturatedAreas.set(`${city}|${state}`, { city, state })
      }
      process.stdout.write(`  [${String(done).padStart(3)}/${queries}] ${label.padEnd(46)} ${String(found.length).padStart(2)} · ${fresh} nuevos\n`)
    } catch (error) {
      failed.push(label)
      process.stdout.write(`  [${String(done).padStart(3)}/${queries}] ${label.padEnd(46)} ✗ ${(error as Error).message}\n`)
    }
  }
}

const rows = [...byPlaceId.values()]
const withPhone = rows.filter(row => row.phone).length
const withoutWebsite = rows.filter(row => !row.website).length
const withoutState = rows.filter(row => !row.state).length

writeFileSync(outFile, JSON.stringify({ track: rawTrack, generatedAt: new Date().toISOString(), items: rows }, null, 2))

console.log(`\n${'─'.repeat(60)}\n`)
console.log(`  Encontrados            ${rows.length} únicos de ${queries} consultas`)
console.log(`  Con teléfono           ${withPhone}`)
console.log(`  Sin web (mejor prospecto) ${withoutWebsite}`)
if (withoutState) console.log(`  ⚠ Sin estado           ${withoutState} — esos no se podrán llamar`)
if (failed.length) console.log(`  ✗ Consultas fallidas   ${failed.length}`)
console.log(`\n  Guardado en ${outFile}\n`)

if (saturated.length) {
  // Se deja escrito para que la segunda pasada sea mecánica: basta con abrir el
  // fichero y sustituir cada ciudad por sus barrios.
  const saturatedFile = outFile.replace(/\.json$/, '') + '.saturadas.json'
  writeFileSync(saturatedFile, JSON.stringify([...saturatedAreas.values()], null, 2))

  console.log(`⚠ ${saturated.length} consultas tocaron el techo de ${PER_QUERY_CAP}, en ${saturatedAreas.size} zonas.`)
  console.log('  Ahí hay más negocios de los que estamos viendo.')
  for (const label of saturated.slice(0, 8)) console.log(`    · ${label}`)
  if (saturated.length > 8) console.log(`    · … y ${saturated.length - 8} más`)
  console.log(`\n  Zonas guardadas en ${saturatedFile}. Ábrelo, cambia cada ciudad por`)
  console.log('  sus barrios —"New York" → "Manhattan", "Queens", "Brooklyn"— y repite:')
  console.log(`    npm run prospect:usa -- ${rawTrack} --areas ${saturatedFile} --run --out ${outFile.replace(/\.json$/, '')}-barrios.json\n`)
}

console.log('Siguiente paso — importar (deduplica, audita y puede matricular en la secuencia):')
console.log('  POST /api/prospects/import')
console.log(`  { "campaignId": "…", "sequenceId": "…", "state": "…", "items": [ … de ${outFile} … ] }\n`)
console.log('Empieza con 10 items para ver un informe entero antes de soltar la lista.\n')
}

main().catch(error => {
  console.error('\nEl barrido falló:', (error as Error).message, '\n')
  process.exitCode = 1
})

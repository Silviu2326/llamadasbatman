#!/usr/bin/env node
// Busca textos en español de src/ que la tabla de src/i18n/legacyDomTranslation.js
// dejaría sin traducir cuando el idioma es "en".
//
//   node scripts/i18n-coverage.mjs          lista los textos sin cobertura
//   node scripts/i18n-coverage.mjs --count  solo el total (sale 1 si hay alguno)
//
// Es un detector por heurística: acierta el idioma por acentos y palabras
// frecuentes, así que puede colar algún falso positivo. Sirve para no volver a
// dejar media pantalla en español, no como verdad absoluta.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const LEGACY = path.join(ROOT, 'i18n', 'legacyPhrases.js')
const countOnly = process.argv.includes('--count')

// --- tabla de traducción ----------------------------------------------------
const legacySrc = fs.readFileSync(LEGACY, 'utf8')
function pairsFrom(block) {
  const out = []
  const re = /\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g
  let m
  while ((m = re.exec(block))) out.push([m[1].replace(/\\'/g, "'"), m[2].replace(/\\'/g, "'")])
  return out
}
const PHRASES = pairsFrom(legacySrc.slice(legacySrc.indexOf('const PHRASES'), legacySrc.indexOf('const WORDS')))
const WORD_MAP = new Map(
  pairsFrom(legacySrc.slice(legacySrc.indexOf('const WORDS'), legacySrc.indexOf('const WORD_MAP')))
    .map(([from, to]) => [from.toLowerCase(), to]),
)
const PHRASE_MAP = new Map(PHRASES)
const ORDERED_PHRASES = [...PHRASES].sort((a, b) => b[0].length - a[0].length)

// Misma lógica que translate() en legacyDomTranslation.js.
function translate(value) {
  if (!value || !value.trim()) return value
  const trimmed = value.trim()
  const exact = PHRASE_MAP.get(trimmed)
  if (exact) return value.replace(trimmed, exact)
  let next = value
  for (const [from, to] of ORDERED_PHRASES) if (next.includes(from)) next = next.split(from).join(to)
  if (next !== value) return next
  const direct = WORD_MAP.get(trimmed.toLowerCase())
  if (!direct) return next
  const cased = trimmed[0] === trimmed[0].toUpperCase() ? direct[0].toUpperCase() + direct.slice(1) : direct
  return next.replace(trimmed, cased)
}

// --- detección de español ---------------------------------------------------
const SPANISH_WORDS = new Set(`de del la el los las un una unos unas y o pero para por con sin sobre entre desde hasta
cada este esta estos estas ese esa aquel su sus tu tus mi mis nuestro nuestra al lo que quien cuando donde como
mas más muy también tambien todo toda todos todas otro otra otros otras ya no si sí ni ser es son era eran fue
tiene tienen tener hay haz haga hacer crear crea nuevo nueva guardar guardado eliminar borrar buscar añadir
anadir enviar enviado editar cerrar abrir cargando cargar volver siguiente anterior activo activa inactivo
pendiente pendientes correo llamada llamadas reunion reunión reuniones campaña campañas cuenta cuentas
usuario usuarios ajustes configuración configuracion resumen estado fecha hora nombre apellido empresa
cliente clientes venta ventas ingresos objetivo objetivos equipo equipos mensaje mensajes respuesta
seleccionar selecciona elige debes puedes podrás podras aún aun todavía todavia ninguno ninguna
error fallo intenta inténtalo vuelve prueba nada algo alguien nadie`.split(/\s+/).filter(Boolean))
const ACCENTS = /[áéíóúñÁÉÍÓÚÑ¿¡üÜ]/

function looksSpanish(text) {
  const value = text.trim()
  if (value.length < 3) return false
  const tokens = value.toLowerCase().match(/[a-záéíóúñü]+/g) || []
  if (!tokens.length) return false
  const hits = tokens.filter((word) => SPANISH_WORDS.has(word)).length
  if (ACCENTS.test(value)) return hits > 0 || tokens.length <= 3
  return hits >= 1 && hits / tokens.length >= 0.34
}

// Para juzgar la salida ya traducida hace falta más evidencia: "no", "error" o
// "real" son palabras de los dos idiomas y marcaban "No website" como español.
function stillSpanish(text) {
  if (ACCENTS.test(text)) return true
  const tokens = text.toLowerCase().match(/[a-z]+/g) || []
  return tokens.filter((word) => SPANISH_WORDS.has(word)).length >= 2
}

// --- recorrido de src/ ------------------------------------------------------
const files = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full)
  }
})(ROOT)

const findings = []
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  if (rel.startsWith('i18n/')) continue // el catálogo y la tabla son español a propósito
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const seen = new Set()
  const push = (raw, lineNo) => {
    const value = raw.replace(/\s+/g, ' ').trim()
    if (!value || seen.has(value)) return
    if (/^[./#@]/.test(value)) return // rutas y módulos
    if (!/\s/.test(value) && !ACCENTS.test(value)) return // token suelto sin acento
    if (!looksSpanish(value)) return
    const translated = translate(value)
    if (translated !== value && !stillSpanish(translated)) return // ya cubierto
    seen.add(value)
    findings.push({ file: rel, line: lineNo, text: value })
  }
  lines.forEach((line, index) => {
    if (/^\s*(import|export)\s|require\(/.test(line)) return
    let match
    const strings = /(['"`])((?:\\.|(?!\1)[^\\]){3,200})\1/g
    while ((match = strings.exec(line))) push(match[2], index + 1)
    const jsxText = />([^<>{}\n]{3,200})</g
    while ((match = jsxText.exec(line))) push(match[1], index + 1)
  })
}

if (countOnly) {
  console.log(findings.length)
} else if (!findings.length) {
  console.log('Sin textos en español fuera de la tabla de traducción.')
} else {
  const byFile = new Map()
  for (const item of findings) byFile.set(item.file, [...(byFile.get(item.file) || []), item])
  console.log(`${findings.length} textos sin cobertura EN en ${byFile.size} archivos\n`)
  for (const [file, items] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`## ${file} (${items.length})`)
    for (const item of items) console.log(`  ${item.line}\t${item.text}`)
    console.log('')
  }
}
process.exit(findings.length ? 1 : 0)

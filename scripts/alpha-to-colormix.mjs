/* Convierte la alfa hexadecimal concatenada a `color-mix()`.
 *
 * El patrón `background: \`${color}18\`` funcionaba cuando `color` era un hex
 * (`#818cf8` + `18` = `#818cf818`). Tras tokenizar el color, `color` vale
 * `var(--accent-soft)` y el resultado es `var(--accent-soft)18`: CSS inválido,
 * así que la tinta simplemente no se pinta. `color-mix()` funciona con
 * cualquiera de los dos.
 *
 *   node scripts/alpha-to-colormix.mjs          # muestra lo que haría
 *   node scripts/alpha-to-colormix.mjs --write  # escribe
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

// EmbudoChart resuelve el token a hex a propósito: sus colores van a un
// atributo `fill` de SVG, donde color-mix tampoco resolvería.
const SKIP_FILES = ['src/components/dashboard/EmbudoChart.jsx']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (['.jsx', '.js'].includes(extname(name))) out.push(path)
  }
  return out
}

const write = process.argv.includes('--write')
const root = process.cwd()
let hits = 0
let files = 0

for (const path of walk(join(root, 'src'))) {
  const rel = path.slice(root.length + 1).replace(/\\/g, '/')
  if (SKIP_FILES.includes(rel)) continue
  const src = readFileSync(path, 'utf8')
  let fileHits = 0

  const next = src.replace(
    /\$\{([^}]+)\}([0-9a-fA-F]{2})(?![0-9a-fA-F])/g,
    (match, expr, alpha) => {
      const percent = Math.round((parseInt(alpha, 16) / 255) * 100)
      fileHits++
      return `color-mix(in srgb, \${${expr}} ${percent}%, transparent)`
    },
  )

  if (fileHits) {
    files++
    hits += fileHits
    if (write) writeFileSync(path, next)
  }
}

console.log(`${write ? 'convertidas' : 'se convertirían'}: ${hits} alfas en ${files} archivos`)

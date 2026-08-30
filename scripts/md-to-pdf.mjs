// Markdown -> PDF con estilo Vendrava. Uso: node scripts/md-to-pdf.mjs <archivo.md> [salida.pdf]
// ponytail: marked via npx y Chrome headless — sin dependencias nuevas en package.json.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => { try { readFileSync(p, { flag: 'r' }); return true } catch { return false } })

const input = process.argv[2]
if (!input) throw new Error('uso: node scripts/md-to-pdf.mjs <archivo.md> [salida.pdf]')
const output = resolve(process.argv[3] ?? input.replace(/\.md$/, '.pdf'))
if (!CHROME) throw new Error('no se encontró Chrome ni Edge para imprimir el PDF')

// shell: true porque Node >=20 no permite spawnear npx.cmd directamente en Windows
const body = execFileSync('npx', ['--yes', 'marked@15', '--gfm', '-i', `"${resolve(input)}"`], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  shell: true,
})

const css = `
:root {
  --ink: #0f172a; --soft: #475569; --muted: #64748b;
  --accent: #2563eb; --gold: #c9a84c;
  --line: #e2e8f0; --panel: #f8fafc; --panel-2: #f1f5f9;
}
@page { size: A4; margin: 18mm 16mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  font-size: 10.5pt; line-height: 1.6; color: var(--soft);
  margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1, h2, h3, h4 { color: var(--ink); line-height: 1.25; break-after: avoid; margin: 0 0 .5em; }
h1 {
  font-size: 26pt; font-weight: 700; letter-spacing: -.02em;
  padding-bottom: .35em; border-bottom: 3px solid var(--accent);
}
h2 {
  font-size: 15pt; font-weight: 650; margin-top: 1.9em;
  padding-left: .55em; border-left: 4px solid var(--accent);
}
h3 { font-size: 12pt; font-weight: 650; margin-top: 1.5em; color: #1e293b; }
h4 { font-size: 10.5pt; font-weight: 650; margin-top: 1.2em; color: var(--soft); text-transform: uppercase; letter-spacing: .06em; }
h1 + h2 { margin-top: 1.1em; }
p { margin: 0 0 .85em; }
strong { color: var(--ink); font-weight: 650; }
a { color: var(--accent); text-decoration: none; border-bottom: 1px solid rgba(37,99,235,.3); }

table {
  width: 100%; border-collapse: collapse; margin: 1em 0 1.4em;
  font-size: 9.5pt; break-inside: avoid;
}
thead th {
  background: var(--ink); color: #fff; font-weight: 600; text-align: left;
  padding: .55em .7em; letter-spacing: .01em;
}
thead th[align="right"] { text-align: right; }
tbody td { padding: .5em .7em; border-bottom: 1px solid var(--line); vertical-align: top; }
tbody tr:nth-child(even) { background: var(--panel-2); }
tbody tr:last-child td { border-bottom: 2px solid var(--ink); }
tbody td:first-child { color: var(--ink); font-weight: 550; }

blockquote {
  margin: 1.2em 0; padding: .9em 1.1em;
  background: var(--panel); border-left: 4px solid var(--gold);
  color: var(--ink); break-inside: avoid;
}
blockquote p:last-child { margin-bottom: 0; }

pre {
  background: var(--ink); color: #e2e8f0; padding: .9em 1.1em;
  border-radius: 4px; font-size: 8.5pt; line-height: 1.5;
  overflow-x: hidden; white-space: pre-wrap; break-inside: avoid;
}
code { font-family: "Cascadia Mono", Consolas, monospace; font-size: .92em; }
:not(pre) > code {
  background: var(--panel-2); color: #1e293b;
  padding: .1em .35em; border-radius: 3px; border: 1px solid var(--line);
}

ul, ol { margin: 0 0 .9em; padding-left: 1.3em; }
li { margin-bottom: .3em; }
li::marker { color: var(--accent); }
hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
.page-break { break-before: page; }
`

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${basename(input, '.md')}</title><style>${css}</style></head><body>${body}</body></html>`

const tmp = resolve(tmpdir(), `${basename(input, '.md')}.html`)
writeFileSync(tmp, html, 'utf8')
execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  `--print-to-pdf=${output}`, `file:///${tmp.replace(/\\/g, '/')}`,
], { stdio: 'inherit' })
rmSync(tmp, { force: true })
console.log(`PDF: ${output}`)

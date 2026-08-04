/* Sustituye los hex hardcodeados del frontend por los tokens de src/theme.css.
 *
 * Se ejecutó una vez para la migración a tema claro/oscuro, pero se conserva
 * porque ES la documentación del mapeo: si aparece un hex nuevo, se añade aquí
 * y se vuelve a pasar.
 *
 *   node scripts/tokenize-colors.mjs          # muestra lo que haría
 *   node scripts/tokenize-colors.mjs --write  # escribe
 *
 * Reglas de seguridad:
 *  - Solo toca hex opacos de 6 dígitos que estén en MAP. Lo que no está, no se
 *    toca (paletas claras legítimas: login, error boundary, organic-leads).
 *  - #fff/#000 se dejan: son knobs, texto sobre acento y sombras; funcionan en
 *    ambos temas.
 *  - En .jsx no toca atributos JSX (`stroke="#..."`) ni props de Recharts
 *    (`fill:`/`stroke:`/`stopColor:`) porque var() no resuelve en atributos de
 *    presentación SVG. Los gráficos leen los tokens con useThemeColors().
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const MAP = {
  // ── Lienzo ──────────────────────────────────────────────────────────────────
  '--bg': ['080c14', '050a15', '090d16', '070b14', '020b18', '020a16', '020617', '05070c', '061a35',
    '050914', '0b1512', '090d18', '080d18', '04101d', '060d17'],
  // ── Superficies ─────────────────────────────────────────────────────────────
  '--surface': ['0d1117', '0d1320', '0d131f', '0d131d', '0d1421', '0d1422', '0d1523', '0d1524', '0c1423',
    '0f1520', '0a101b', '0b111b', '0a0e1a', '0a0e18', '0d1518', '06111e', '0a101c', '090e1c',
    '0b1018', '080f1b', '0b1020', '0b1320', '0b0f1c', '0a111d', '071523', '071221', '071321',
    '0c111b', '0d131e', '0c121d', '0c1421', '0e1422', '0d1420', '0e151e', '05132a', '0c1321',
    '0c1220', '0d1322', '081524', '0c1320', '0b1423', '0b1421', '0d1423'],
  '--surface-soft': ['0b111d', '0b111c', '0b1220', '0b1019', '0b101b', '09111d', '0c121e', '0b121e'],
  '--surface-2': ['111827', '101827', '0d1424', '102421', '0e1523', '0e1727', '091329', '09162c', '0b1828',
    '0a1929', '0e1626', '0f1725', '0e1726', '0f1724', '10221d', '0f172a', '0a1730', '0f1828',
    '0c1c2d', '101c26', '10182a', '0f1727', '101927'],
  '--surface-3': ['111a2b', '111a2a', '101a2a', '111b2c', '111c2d', '131b2b', '121c2d', '111a2c', '111b2d',
    '111b2b', '121b2b', '12112b', '11172a', '17132a', '121a29', '101a2b', '111b2e', '0b1830',
    '101c2e', '101b2d', '101c2c', '111c2e', '11152a', '10182b', '11182a', '121d2c', '121b2d',
    '10132d', '121a2d', '101c32', '111c30', '0d1a34', '0b1a35', '141d30', '111832', '082039',
    '111d30', '131d30', '101a30', '111b30', '15152e', '131e31', '121b32', '152033', '0d1b38',
    '151633', '131a34', '0d2238', '112135', '151f31', '0b203d', '17172f', '151d31', '171633'],
  '--surface-hover': ['172033', '171b38', '162035', '121a3c', '171634', '172236', '172338', '101e3b', '172238',
    '161b36', '0b2340', '142139', '151e38', '17133c', '162238', '152036', '182036', '141c36',
    '18233a', '1a1a3a', '17223a', '0a2948', '17253a', '17233a', '17243a', '17213a', '1f2937',
    '121d43', '171c40', '102a4d', '1b2943', '1b2940', '1a2940', '1a2248', '082e57', '202b42',
    '202b47', '073265', '172554', '273449', '1c3153', '263a50', '27364c', '242b56', '596577'],
  // ── Líneas ──────────────────────────────────────────────────────────────────
  '--line': ['1a2235', 'edf0f5', '1e2433', '1e293b', '182236', '182235', '1d293e', '1b263b', '131929', '162033',
    '162034', '182333', '182238', '18243a', '182338', '1b2638', '172b41', '1c2639', '1e3b36',
    '1e2a40', '1b2a42', '1b2d43', '1b293f', '1d2a40', '1f2d44', '1e2a41', '1c2c44', '1c2a43',
    '1d2a42', '1c2b43', '1d2b43', '202c43', '1e2b43', '202c42', '202a40', '202d47', '1b2d4d',
    '23453d'],
  '--line-2': ['2e435b', '30415e', '30435f', '31405d', '33415c', '334766', '3a4c69', '40516d', '465582', '526580', '273249', '273652', '263650', '263653', '27314b', '25324a', '2d3b59', '2c3853', '202b40',
    '2a3245', '21304a', '2d405e', '33415f', '465579', '354164', '2a3954', '202e47',
    '334155', '32425f', '223047', '243047', '21314a', '203049', '203249', '20304a',
    '23304b', '24314d', '22314c', '22314d', '22334d', '24334e', '23324b', '26314a', '273248',
    '253452', '2d3748', '29344c', '263750', '243550', '26344d', '273650', '29354b', '263550',
    '293752', '283451', '293953', '273953', '1f365c', '283954', '283653', '283554', '263c55',
    '243c58', '293650', '263952', '293852', '273653', '293750', '2a3550', '2b3751', '2b3651',
    '2a3854', '2c3a56', '2b3952', '21395d', '293b59', '273d57', '263d57', '2a3d54', '253d58',
    '283b57', '2b3b57', '213d61', '2a3b57', '2a3855', '283957', '293556', '293b57', '2b3852',
    '2b3954', '2c3953', '2a3953', '3b2b58', '28345c', '345247', '2c3e5a', '2b3e5a', '263b61',
    '2c3c5a', '2c3b59', '2b3a58', '2b3c58', '28445f', '315344', '2c3d5a', '284064', '2f3d5b',
    '2c3d5d', '2b3d5d', '29435f', '2e405e', '294162', '2d3f5e', '303d59', '303b5c', '30405e',
    '33415e', '2f3d5f', '34405c', '304460', '2e4260', '294367', '294864', '33415b', '34415a',
    '354761', '344862', '354660', '2c4268', '2b4369', '33435f', '334762', '33455f', '33445f',
    '344561', '344661', '34455f', '344762', '304464', '334462', '34425e', '34415f', '354866',
    '344566', '2b446c', '344b67', '354566', '39465e', '384462', '3c4860', '35496a',
    '33426a', '384a68', '3a4864', '354967', '37476a', '3a356e', '3a4d6b', '304a73',
    '394d6c', '37466a', '3b4f6d', '3c506e', '3a4b70', '384b70', '3b506c', '3a4d70', '3b4e6d',
    '3d5070', '3d4d70', '3c4c70', '33417a', '38527b', '435170', '3f5278', '45547a', '425279',
    '31548a', '455b7a', '41527a', '47597a', '455a7b', '445b7f', '465a7a', '465b7b', '4c5d79',
    '4a4b80', '4a5682', '50617d', '52637e', '4f5e91', '4265a4'],
  '--line-hover': ['344766', '34476a', '3974a8', '3b4964', '42618f', '506486', '516687', '526889', '536898', '56669b', '56678e', '566987', '56729d', '586a93', '5b5b91', '637596', '6475a4', '6575b2', '6675a1', '6675a4', '6675aa', '6676aa', '6d78a9', '7181bb', '7184a8', '8fa0c0'],
  // ── Texto ───────────────────────────────────────────────────────────────────
  '--text': ['e2e8f0', 'd5deea', 'd6e0eb', 'd2dced', 'd8e1ed', 'd4dff0', 'd8e3f3', 'dbe5f2', 'dbe5f4',
    'dce6f5', 'dce6f4', 'dce6f3', 'dce7f3', 'dbe8f5', 'd9e8f8', 'dce7f6', 'd8e9f7', 'dce6fb',
    'dbe6fb', 'd8ebff', 'dfe9f8', 'e5edf7'],
  '--text-strong': ['dbeafe', 'f1f5f9', 'f8fafc', 'eaf0fb', 'edf3ff', 'ebf1fb', 'eef3ff', 'f3f6fb', 'f8fbff', 'e0e7ff', 'e6edf9', 'dfeaff', 'e5edf8', 'e7edf9', 'e0f2fe', 'e8edf7', 'e0e4ff', 'edf2f7',
    'eaf0fa', 'e7edff', 'e8efff', 'e4fdff', 'e6efff', 'e8f0ff', 'ecf2f9', 'e4f1ff', 'e9effa',
    'e9e7ff', 'ede9fe', 'e7eefb', 'eaf1fd', 'ecfffb', 'edf3fc', 'edf4ff', 'eef4fc', 'f1f5fa',
    'f2f5f9', 'e9edff', 'ecf2ff', 'eff4fd', 'f0fdf4', 'eff6ff', 'eef2ff', 'f6f7fb', 'f3f7fc',
    'eff5ff', 'eef4ff', 'eff4ff', 'f1f5ff', 'f3f6ff', 'f4f8ff', 'f6f9ff', 'f4f7ff', 'f6f8ff',
    'f3f5ff', 'f4f6ff', 'f5f3ff', 'f8faff'],
  '--text-2': ['cbd5e1', 'd6e3f5', 'd8e3f4', 'dce8ff', 'dbe4f0', 'dbe4f1', 'dce8f8', 'dce7f7', 'e5edf9',
    'b5c1d0', 'aebddd', 'b7c2d4', 'aebce0', 'aebfe1', 'aabce4', 'b7c5d5', 'b5c4d9', 'b7c6da',
    'b7c5dc', 'b7c5da', 'b5c7dc', 'bdc8db', 'bac8df', 'b8c9e7', 'c1cde2', 'b9c8e7', 'c2cfe2',
    'c2d0e6', 'bfcceb', 'cbd7e8', 'cbd8e9', 'cbd9e8', 'cbd7e9', 'cbd9ec', 'cdd9ec', 'cbd9ed',
    'cbd8ed', 'cfdbec'],
  '--muted': ['94a3b8', '9ca3af', '91a0b7', '8b9bb6', '748aac', '7e8ca0', '788aa4', '7c8ba4', '7b8ca5',
    '6f7fb1', '7789a5', '7f8ca3', '7f8fa4', '7e90a5', '7e8da5', '7d8da5', '7d8ca5', '7d8ea8',
    '7e8da4', '7f8da4', '7f8ca5', '7e90ab', '7e90aa', '7690b4', '8290a7', '8391a4', '8392a5',
    '8292a7', '7e90a9', '8090a9', '8290a8', '8190a8', '7f8fa8', '7f8eaa', '7f90aa', '8392aa',
    '8290a9', '7a8db2', '8092ae', '8594a8', '8193ad', '8292aa', '8190aa', '7f91ad', '8192ab',
    '8293ad', '8491a7', '8595ad', '8595ae', '8596af', '8394af', '8494ac', '8093b1', '8194b2',
    '8998aa', '8798ad', '8493ad', '8394ae', '8798b1', '8596b1', '8094b6', '8195b5', '8998af',
    '8798b2', '8697b1', '8597b0', '899ab3', '8b9ab3', '8a9ab2', '8da0b9', '8ea2ba', '8fa0ba',
    '93a2b9', '91a3bb', '88a1c6', '8fa1ba', '91a5bd', '8fa1c1', '9aa8bb', '9aa9bb', '9aa8be',
    '9aaac3', '9daabd', '98a9c2', '9babc2', '9ba9c0', 'a4afbe', 'a4b0c0', 'a5b2c3', 'a8b5c9',
    'a6b5ca', '9eb0cf', 'a9b5c6', 'aab6c5', 'a7b4c8', 'a5b4c8', 'a5b4ca', 'a5b4cc', 'a5b5c9',
    'a6b4c8', 'aab7ca', 'a8b7cc', 'aab7ce', 'aebcd0'],
  '--dim': ['3b557c', '647590', '64748b', '6b7280', '718096', '71809a', '748197', '8190a7', '8191aa', '687892', '71819a',
    '55657e', '52627d', '53637c', '53647e', '596984', '536987', '5b6e89', '5d6e89', '5d6e88',
    '5c6e88', '5c6d88', '61718b', '5f718c', '5d6f8c', '5f718e', '60728d', '63738d', '61748e',
    '63728b', '61738e', '63738e', '62738e', '60738f', '65748d', '60728e', '62758f', '66748b',
    '637590', '627895', '607797', '657590', '637792', '657691', '657792', '66758e', '6b7a91',
    '647896', '667793', '667892', '61779e', '687a95', '697c97', '6f7f97', '687d9e', '68799a',
    '6d7d97', '6f819a', '718198', '718299', '6e819c', '6e8099', '6f809b', '6e809a', '70819b',
    '718099', '6e809c', '71819c', '73809a', '9f7080', '71849f', '71849d', '71849e', '6680a7',
    '72829d', '71819b', '71829e', '72839e', '72849e', '74839b', '75849b', '71839f', '71839e',
    '75859d', '6e83a4', '7486a0', '72849f', '73849e', '7286a1', '78869c', '75859e', '7186a6',
    '7689a4', '7487a2', '7586a2', '7888a2', '7588a4', '7889a3', '7787a2', '7688a3'],
  '--faint': ['374151', '4b5563', '475569', '596981', '53627a', '26324a', '33415d', '42516e', '4b5f7d', '52627b',
    '51617b', '52627a', '52617a', '526079', '53627b'],
  // ── Acento ──────────────────────────────────────────────────────────────────
  '--accent': ['6366f1', '6d5bd9', '5b4dea', '635bde', '6558e8', '6d5fe8', '7165ed', '746cf0', '786df0',
    '7c6cf4', '7d6df4', '7165ff'],
  '--accent-soft': ['818cf8', '818cf6', '8176f3', '7774ff', '7c8ff8', '8b7bff', '7c8cff', '8b82f7', '7f8fff',
    '8b93ff', 'a99aff'],
  '--accent-faint': ['a5b4fc', 'c7d2fe', 'aab1ff', 'aab4ff', 'b4a7ff', 'b7c2ff'],
  '--accent-deep': ['4f46e5', '3730a3', '4338ca'],
  '--accent-bg': ['1e40af', '312e81', '1e2450', '19122a', '1e1538', '1e1060', '37317a', '4c1d95'],
  // ── Secundarios ─────────────────────────────────────────────────────────────
  '--violet': ['a78bfa', '8b5cf6', 'd946ef', 'a855f7', '9f67fa', '8a64ff'],
  '--violet-soft': ['c4b5fd', 'ddd6fe', 'a16cff', 'c084fc', 'd084ff', 'f0abfc', 'd8b4fe', 'f5d0fe', 'e9d5ff'],
  '--violet-deep': ['7c3aed', '6d28d9', 'c026d3', '7c2de8'],
  '--cyan': ['22d3ee', '0aa8dc', '0ea5e9'],
  '--cyan-soft': ['67e8f9', '7dd3fc', '38bdf8', '7de5f1', '8beaf6'],
  '--cyan-deep': ['0891b2', '0e7490', '06b6d4', '155e75'],
  '--pink': ['ec4899', 'f472b6', 'be185d', 'db2777', 'f9a8d4', 'fbcfe8'],
  '--lime': ['84cc16', 'bef264'],
  // ── Semánticos ──────────────────────────────────────────────────────────────
  '--success': ['34d399', '10b981', '2dd4bf', '0d9488', '14b8a6', '22c55e', '20c89a', '27d39b', '27df9d',
    '39d59b', '46d4b0', '49dcae'],
  '--success-soft': ['6ee7b7', '86efac', '4ade80', 'bbf7d0', 'a7f3d0', '5eead4', '6fe4bd', '6ee7d2', '74e8c1',
    '74f0c3', '9ae6d0', 'd1fae5'],
  '--success-deep': ['059669', '047857', '166534', '0f766e', '15803d', '1f8a72',
    '16a34a'],
  '--success-bg': ['065f46', '14532d', '16452f', '0d211b', '0c2420', '0d211c', '0d2118', '07352d', '064e3b'],
  '--warn': ['f59e0b', 'fb923c', 'ea580c', 'f97316', 'f4a51c', 'f5bf45', 'd9ad67'],
  '--warn-soft': ['fbbf24', 'fcd34d', 'f4c86b', 'fdba74', 'f8c875'],
  '--warn-faint': ['fde68a', 'fef3c7'],
  '--warn-deep': ['d97706', 'b45309', '956900', 'a16207', 'c2410c'],
  '--warn-bg': ['322607'],
  '--danger': ['ef4444', 'f43f5e'],
  '--danger-soft': ['f87171', 'fda4af', 'fb7185', 'ff6b5f', 'ff7d6d', 'ff9b9b'],
  '--danger-faint': ['fca5a5', 'fecdd3', 'ffe4e6', 'fecaca', 'fee2e2'],
  '--danger-deep': ['dc2626', '991b1b', 'b91c1c'],
  '--danger-bg': ['7f1d1d', '2a1218', '4c1020'],
  '--info': ['60a5fa', '338cdb', '1687ff', '178dff', '2c9bff', '31a0ff', '50a5ec', '4aa9ff',
    '55aaff', '58adff', '55c6ff', '74b8ef', '77b9ff', '93c5fd', 'a8ccef', 'aebef0', 'bfdbfe'],
  '--info-deep': ['3b82f6', '2563eb', '155b81', '0369a1', '1263aa', '137edb', '1d4ed8', '087bf0',
    '1d83ed'],
}

// Archivos de gráfico: los colores acaban en atributos SVG, var() no resuelve.
const SKIP_FILES = [
  'src/theme.css',
  'src/components/dashboard/DonutChart.jsx',
  'src/components/dashboard/EmbudoChart.jsx',
  'src/components/dashboard/IngresosChart.jsx',
  'src/components/dashboard/RendimientoChart.jsx',
]

const hexToToken = new Map()
for (const [token, hexes] of Object.entries(MAP)) {
  for (const hex of hexes) {
    if (hexToToken.has(hex)) throw new Error(`hex duplicado en MAP: #${hex}`)
    hexToToken.set(hex, token)
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (['.css', '.jsx', '.js'].includes(extname(name))) out.push(path)
  }
  return out
}

// En .jsx, un hex dentro de un atributo JSX o de una prop de Recharts va a
// parar a un atributo de presentación SVG: ahí var() no funciona.
const SVG_CONTEXT = /(?:=\s*"|(?:fill|stroke|stopColor)\s*:\s*['"])$/

const write = process.argv.includes('--write')
const root = process.cwd()
let files = 0
let hits = 0
const unmapped = new Map()

for (const path of walk(join(root, 'src'))) {
  const rel = path.slice(root.length + 1).replace(/\\/g, '/')
  if (SKIP_FILES.includes(rel)) continue
  const src = readFileSync(path, 'utf8')
  const isJsx = rel.endsWith('.jsx')
  let fileHits = 0

  // \b al final evita partir hex de 8 dígitos (con alfa), que se dejan tal cual.
  const next = src.replace(/#([0-9a-fA-F]{6})\b(?![0-9a-fA-F])/g, (match, hex, offset) => {
    const token = hexToToken.get(hex.toLowerCase())
    if (!token) {
      unmapped.set(hex.toLowerCase(), (unmapped.get(hex.toLowerCase()) || 0) + 1)
      return match
    }
    if (isJsx && SVG_CONTEXT.test(src.slice(Math.max(0, offset - 24), offset))) return match
    fileHits++
    return `var(${token})`
  })

  if (fileHits) {
    files++
    hits += fileHits
    if (write) writeFileSync(path, next)
  }
}

console.log(`${write ? 'reescritos' : 'se reescribirían'}: ${hits} hex en ${files} archivos`)
const rest = [...unmapped.entries()].sort((a, b) => b[1] - a[1])
console.log(`sin mapear: ${rest.length} hex distintos (${rest.reduce((n, e) => n + e[1], 0)} usos)`)
console.log(rest.slice(0, 40).map(([h, n]) => `  #${h} ×${n}`).join('\n'))

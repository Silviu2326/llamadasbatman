import { BrandKit } from './brandKit.service'
import { saveGeneratedFile } from './generatedMedia.service'

/**
 * Carruseles con plantilla de marca — idea 7, `roadmap.md` fase 2.
 *
 * "La IA solo rellena textos": la plantilla es código, no una imagen que un
 * modelo dibuja. Cada slide se compone como un SVG de 1080×1080 con los colores
 * y el logo de la organización, y el texto entra dentro con las mismas reglas
 * siempre.
 *
 * Tres decisiones que explican por qué es así:
 *
 * - **SVG y no PNG.** Rasterizar en el backend exigiría una dependencia nativa
 *   (sharp, resvg) para algo que el navegador ya sabe hacer: el Estudio dibuja
 *   el SVG en un canvas y sube el PNG por el mismo endpoint de medios que usa
 *   la imagen de la pieza. El backend se queda con la parte determinista.
 * - **El logo se empotra en base64.** Un `<image href="https://…">` no se carga
 *   cuando el SVG se dibuja en un canvas —el navegador lo bloquea— así que el
 *   carrusel se vería sin logo justo al convertirlo. Se descarga aquí una vez.
 * - **El texto se escapa y se parte a mano.** SVG no tiene salto de línea
 *   automático: sin partirlo, una slide larga se sale del lienzo y nadie lo ve
 *   hasta que está publicada.
 */

const SIZE = 1080
const MARGIN = 96
/** Ancho útil en caracteres para cada tamaño de letra, medido a ojo sobre Inter. */
const CHARS_PER_LINE: Record<number, number> = { 72: 20, 56: 26, 44: 34, 32: 46 }

export interface CarouselSlideSvg {
  index: number
  kind: 'cover' | 'content' | 'closing'
  svg: string
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Parte el texto en líneas que caben. Las palabras más largas que una línea se
 * cortan: preferible partir una palabra que dejar que se salga del lienzo.
 */
export function wrapText(text: string, fontSize: number, maxLines: number) {
  const perLine = CHARS_PER_LINE[fontSize] ?? Math.floor(SIZE / (fontSize * 0.6))
  const lines: string[] = []
  let current = ''

  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (word.length > perLine) {
      if (current) { lines.push(current); current = '' }
      for (let index = 0; index < word.length; index += perLine) lines.push(word.slice(index, index + perLine))
      continue
    }
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= perLine) current = candidate
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)

  if (lines.length <= maxLines) return lines
  // Se recorta con puntos suspensivos: una slide que se corta a mitad de frase
  // se ve como un error, y así se ve como lo que es, un texto demasiado largo.
  const trimmed = lines.slice(0, maxLines)
  trimmed[maxLines - 1] = `${trimmed[maxLines - 1].replace(/[\s,;:]+$/, '')}…`
  return trimmed
}

/** El tamaño de letra lo decide la longitud: cuanto más texto, más pequeño. */
function fontSizeFor(text: string, sizes: number[]) {
  for (const size of sizes) {
    if (wrapText(text, size, 8).length <= 6) return size
  }
  return sizes[sizes.length - 1]
}

function textBlock(text: string, options: { fontSize: number; color: string; y: number; maxLines: number; weight?: number; font: string }) {
  const lines = wrapText(text, options.fontSize, options.maxLines)
  const lineHeight = Math.round(options.fontSize * 1.28)
  return lines.map((line, index) => (
    `<text x="${MARGIN}" y="${options.y + index * lineHeight}" font-family="${escapeXml(options.font)}" font-size="${options.fontSize}" font-weight="${options.weight ?? 600}" fill="${options.color}">${escapeXml(line)}</text>`
  )).join('\n    ')
}

function logoBlock(logo: string | null, x: number, y: number) {
  if (!logo) return ''
  return `<image href="${escapeXml(logo)}" x="${x}" y="${y}" width="180" height="60" preserveAspectRatio="xMinYMid meet"/>`
}

/**
 * Compone una slide. La portada y el cierre van en el color primario; las de
 * contenido en el secundario, para que se distinga de un vistazo dónde empieza
 * y dónde acaba el carrusel.
 */
function slideSvg(
  kind: CarouselSlideSvg['kind'],
  text: string,
  options: { brand: BrandKit; logo: string | null; position: number; total: number; footer: string | null },
) {
  const { brand } = options
  const isAccent = kind !== 'content'
  const background = isAccent ? brand.primary : brand.secondary
  const foreground = isAccent ? brand.text : brand.primary
  const fontSize = kind === 'cover' ? fontSizeFor(text, [72, 56, 44]) : fontSizeFor(text, [56, 44, 32])

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${background}"/>
  <rect x="0" y="0" width="${SIZE}" height="12" fill="${isAccent ? brand.secondary : brand.primary}"/>
  <g>
    ${textBlock(text, { fontSize, color: foreground, y: kind === 'cover' ? 380 : 320, maxLines: 6, font: brand.fontFamily, weight: kind === 'content' ? 500 : 700 })}
  </g>
  <text x="${MARGIN}" y="${SIZE - MARGIN}" font-family="${escapeXml(brand.fontFamily)}" font-size="28" fill="${foreground}" opacity="0.7">${options.position}/${options.total}</text>
  ${options.footer ? `<text x="${SIZE - MARGIN}" y="${SIZE - MARGIN}" text-anchor="end" font-family="${escapeXml(brand.fontFamily)}" font-size="28" fill="${foreground}" opacity="0.7">${escapeXml(options.footer)}</text>` : ''}
  ${logoBlock(options.logo, MARGIN, MARGIN - 20)}
</svg>`
}

/**
 * Descarga el logo y lo devuelve como `data:` URI. Si no se puede, el carrusel
 * sale sin logo: una plantilla sin logo sigue siendo la plantilla del negocio;
 * una que falla entera por el logo no sirve para nada.
 */
export async function inlineLogo(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(logoUrl, { signal: controller.signal })
    if (!response.ok) return null
    const type = response.headers.get('content-type') ?? ''
    if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)$/.test(type)) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    // Un logo enorme haría el SVG imposible de mover; 2 MB es de sobra.
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) return null
    return `data:${type};base64,${buffer.toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Slides de un carrusel: portada con el título, una por cada texto y cierre.
 * `footer` es el nombre del negocio, que va en todas menos en la portada.
 */
export async function renderCarouselSlides(
  brand: BrandKit,
  carousel: { title?: string; slides?: unknown[] },
  options: { businessName?: string | null } = {},
): Promise<CarouselSlideSvg[]> {
  const title = String(carousel.title ?? '').trim()
  const texts = (Array.isArray(carousel.slides) ? carousel.slides : [])
    .map(slide => String(slide ?? '').trim())
    .filter(Boolean)
  if (!title && !texts.length) return []

  const logo = await inlineLogo(brand.logoUrl)
  const footer = options.businessName?.trim() || null
  const total = texts.length + (title ? 1 : 0)

  const slides: CarouselSlideSvg[] = []
  let position = 0

  if (title) {
    position += 1
    slides.push({ index: 0, kind: 'cover', svg: slideSvg('cover', title, { brand, logo, position, total, footer: null }) })
  }
  for (const [index, text] of texts.entries()) {
    position += 1
    // La última slide de texto es el cierre: es donde va la llamada a la acción
    // que escribió el modelo, y se marca con el color de la portada.
    const kind: CarouselSlideSvg['kind'] = index === texts.length - 1 ? 'closing' : 'content'
    slides.push({ index: slides.length, kind, svg: slideSvg(kind, text, { brand, logo, position, total, footer }) })
  }

  return slides
}

/**
 * Renderiza y publica las slides. Devuelve las URLs en orden, o una lista vacía
 * con el motivo si no se pudieron guardar (falta `PUBLIC_HOST`).
 */
export async function publishCarouselSlides(
  brand: BrandKit,
  carousel: { title?: string; slides?: unknown[] },
  options: { businessName?: string | null } = {},
): Promise<{ urls: string[]; reason: string | null }> {
  const slides = await renderCarouselSlides(brand, carousel, options)
  if (!slides.length) return { urls: [], reason: 'El carrusel no tiene textos que maquetar.' }

  const urls: string[] = []
  for (const slide of slides) {
    const saved = await saveGeneratedFile(Buffer.from(slide.svg, 'utf8'), 'svg')
    if (!saved) return { urls: [], reason: 'Falta PUBLIC_HOST: las slides se componen pero no se pueden servir.' }
    urls.push(saved.publicUrl)
  }
  return { urls, reason: null }
}

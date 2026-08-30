// Recolección de la web de un cliente para el onboarding asistido.
//
// Solo código: descarga, limpia y observa. No interpreta nada — de eso se
// encarga el modelo en websiteIntake.service.ts, y siempre sobre este texto.
//
// La regla que sostiene el modo entero es la de prospectResearch.service.ts:
// el modelo no decide qué es cierto, el código lo comprueba. Por eso aquí
// viven las dos comprobaciones: la cita literal (verifyQuote) y el conjunto
// de contactos realmente observados en las páginas (observeContacts), contra
// el que se validan teléfonos y emails antes de escribirlos en la ficha de un
// cliente real.
import { fetchHtml, normalizeUrl } from './digitalAudit.service'
import { htmlToText } from './prospectResearch.service'

export const MAX_INTAKE_PAGES = 8
const MAX_CHARS_PER_PAGE = 9_000
const MIN_QUOTE_CHARS = 12

/**
 * Rutas que suelen decir algo del negocio, por orden de interés. Una página
 * por categoría: ocho páginas que cuentan cosas distintas valen más que ocho
 * variantes de la misma.
 */
const INTAKE_PATHS: RegExp[] = [
  /sobre|about|quienes|nosotros|historia|empresa/i,
  /servicio|service|producto|product|soluciones|tratamiento/i,
  /precio|tarifa|price|pricing|plan|bono|presupuesto/i,
  /equipo|team|staff|personas|profesionales/i,
  /contacto|contact|cita|reserva|booking|donde-estamos/i,
  /faq|preguntas|ayuda|help|soporte/i,
  /caso|case|cliente|testimon|opiniones|portfolio|proyectos/i,
  /condiciones|terminos|terms|legal|garantia|politica/i,
]

export interface IntakePage {
  url: string
  title: string | null
  /** Texto plano, recortado. Es lo único que ve el modelo. */
  text: string
  /** HTML crudo recortado: solo se usa para observar mailto/tel, no viaja al modelo. */
  html: string
}

export interface ObservedContacts {
  emails: Set<string>
  /** Solo dígitos, para comparar sin depender del formato. */
  phoneDigits: string[]
  socials: Record<string, string>
}

function titleOf(html: string): string | null {
  return html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i)?.[1].replace(/\s+/g, ' ').trim() || null
}

/** Enlaces internos interesantes, uno por categoría y en orden de interés. */
export function pickIntakeLinks(html: string, baseUrl: string, limit = MAX_INTAKE_PAGES - 1): string[] {
  let origin: string
  try {
    origin = new URL(baseUrl).origin
  } catch {
    return []
  }
  const byCategory = new Map<number, string>()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    let resolved: URL
    try {
      resolved = new URL(match[1], baseUrl)
    } catch {
      continue
    }
    if (resolved.origin !== origin) continue
    resolved.hash = ''
    const href = resolved.toString()
    if (href.replace(/\/$/, '') === baseUrl.replace(/\/$/, '')) continue
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|docx?|xlsx?)$/i.test(resolved.pathname)) continue
    const category = INTAKE_PATHS.findIndex(pattern => pattern.test(resolved.pathname))
    if (category === -1) continue
    if (!byCategory.has(category)) byCategory.set(category, href)
  }
  return [...byCategory.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, href]) => href)
    .slice(0, limit)
}

/** Descarga la home y hasta MAX_INTAKE_PAGES-1 páginas internas, en paralelo. */
export async function collectIntakePages(website: string): Promise<IntakePage[]> {
  const homeUrl = normalizeUrl(website)
  if (!homeUrl) return []
  const home = await fetchHtml(homeUrl)
  if (home.status !== 200 || home.html.length < 200) return []

  const finalUrl = home.info.finalUrl || homeUrl
  const pages: IntakePage[] = [{
    url: finalUrl,
    title: titleOf(home.html),
    text: htmlToText(home.html).slice(0, MAX_CHARS_PER_PAGE),
    html: home.html.slice(0, 400_000),
  }]

  const links = pickIntakeLinks(home.html, finalUrl)
  const rest = await Promise.all(links.map(async url => {
    const page = await fetchHtml(url, 8_000).catch(() => null)
    if (!page || page.status !== 200 || page.html.length < 200) return null
    const text = htmlToText(page.html)
    if (text.length < 120) return null
    return { url, title: titleOf(page.html), text: text.slice(0, MAX_CHARS_PER_PAGE), html: page.html.slice(0, 400_000) }
  }))
  return pages.concat(rest.filter((page): page is IntakePage => page !== null))
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const TEL_HREF_RE = /href=["']tel:([^"']+)["']/gi
// Teléfono escrito en el texto: prefijo opcional y 9-15 dígitos con
// separadores. Deliberadamente laxo: es una lista de candidatos observados,
// no un validador — lo que importa es que el número esté EN la web.
const PHONE_TEXT_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}/g

const SOCIAL_HOSTS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'instagram', pattern: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.\-/]+/i },
  { key: 'facebook', pattern: /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_.\-/]+/i },
  { key: 'linkedin', pattern: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/[A-Za-z0-9_.\-/]+/i },
  { key: 'x', pattern: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_.\-/]+/i },
  { key: 'youtube', pattern: /https?:\/\/(?:www\.)?youtube\.com\/[A-Za-z0-9_.\-/@]+/i },
  { key: 'tiktok', pattern: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.\-]+/i },
]

export function digitsOf(value: string): string {
  return value.replace(/\D+/g, '')
}

/**
 * Contactos que las páginas realmente contienen. Un email o un teléfono que
 * el modelo proponga y no esté aquí es una invención y se descarta: escribir
 * un teléfono inventado en la ficha de un cliente es peor que dejarla vacía.
 */
export function observeContacts(pages: IntakePage[]): ObservedContacts {
  const emails = new Set<string>()
  const phoneDigits = new Set<string>()
  const socials: Record<string, string> = {}

  for (const page of pages) {
    const haystack = `${page.html} ${page.text}`
    for (const email of haystack.match(EMAIL_RE) ?? []) {
      const value = email.toLowerCase()
      // Nombres de asset con forma de email (raros pero existen) no son
      // contactos: el filtro de extensión los quita.
      if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(value)) continue
      emails.add(value)
    }
    for (const match of page.html.matchAll(TEL_HREF_RE)) {
      const digits = digitsOf(match[1])
      if (digits.length >= 7) phoneDigits.add(digits)
    }
    for (const candidate of page.text.match(PHONE_TEXT_RE) ?? []) {
      const digits = digitsOf(candidate)
      if (digits.length >= 9 && digits.length <= 15) phoneDigits.add(digits)
    }
    for (const { key, pattern } of SOCIAL_HOSTS) {
      if (socials[key]) continue
      const found = page.html.match(pattern)?.[0]
      if (found) socials[key] = found
    }
  }
  return { emails, phoneDigits: [...phoneDigits], socials }
}

/** Normaliza para comparar citas: sin acentos, sin comillas, espacios colapsados. */
export function canonical(value: string): string {
  return value
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/["'«»“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * La cita tiene que aparecer literalmente en alguna página descargada. Un
 * modelo puede inventarse una frase; no puede hacer que aparezca en una web
 * que no la tiene.
 */
export function verifyQuote(quote: string | null | undefined, pages: IntakePage[]): boolean {
  const needle = canonical(quote ?? '')
  if (needle.length < MIN_QUOTE_CHARS) return false
  return pages.some(page => canonical(page.text).includes(needle))
}

/** Un teléfono solo vale si sus dígitos aparecen en la web. */
export function phoneObserved(phone: string | null | undefined, observed: ObservedContacts): boolean {
  const digits = digitsOf(phone ?? '')
  if (digits.length < 7) return false
  return observed.phoneDigits.some(candidate => candidate.endsWith(digits) || digits.endsWith(candidate))
}

export function emailObserved(email: string | null | undefined, observed: ObservedContacts): boolean {
  const value = (email ?? '').trim().toLowerCase()
  return Boolean(value) && observed.emails.has(value)
}

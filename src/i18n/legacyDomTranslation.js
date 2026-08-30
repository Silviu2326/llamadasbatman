import { useEffect } from 'react'
import { useI18n } from './index.js'

// Legacy pages still contain a few inline labels. Keep them localized while
// those pages are migrated to message keys one by one.

let PHRASE_MAP = null
let ORDERED_PHRASES = []
let WORD_MAP = new Map()
let pending = null

// La tabla pesa ~450 KB, así que no entra en el bundle inicial: solo se
// descarga cuando alguien pone la interfaz en inglés.
export function loadPhrases() {
  if (PHRASE_MAP) return Promise.resolve()
  if (!pending) {
    pending = import('./legacyPhrases.js').then(({ PHRASES, WORDS }) => {
      // Frase larga primero: si no, una frase corta contenida en otra la parte
      // por la mitad ("Guardar" dentro de "Guardarraíles").
      ORDERED_PHRASES = [...PHRASES].sort((a, b) => b[0].length - a[0].length)
      WORD_MAP = new Map(WORDS.map(([from, to]) => [from.toLowerCase(), to]))
      PHRASE_MAP = new Map(PHRASES)
    })
  }
  return pending
}

// Una palabra suelta solo se traduce cuando ES el texto completo del nodo (una
// etiqueta o un badge). Nunca se sustituye dentro de una frase: así el nombre
// de un cliente ("Ventas Directas", "Rosa Alta") jamás se reescribe.
export function translate(value) {
  if (!PHRASE_MAP) return value
  if (!value || !value.trim()) return value
  const trimmed = value.trim()
  // La mayoría de nodos son una frase exacta de la tabla: se resuelven con una
  // búsqueda en el Map en vez de recorrerla entera en cada mutación del DOM.
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

const textState = new WeakMap()
const attrState = new WeakMap()

function translateNode(node, locale) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement?.closest('.login-locale-switcher, .sidebar-locale-switcher, [data-i18n-skip]')) return
    const current = node.nodeValue || ''
    const state = textState.get(node) || { original: current, lastOutput: current }
    if (current !== state.lastOutput) state.original = current
    const next = locale === 'en' ? translate(state.original) : state.original
    state.lastOutput = next
    textState.set(node, state)
    if (current !== next) node.nodeValue = next
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node
  // data-i18n-skip marca contenido del usuario (nombres, empresas,
  // transcripciones, notas): no se traduce nunca.
  // El contenido de estos nodos no se toca (es código o lo que ha escrito el
  // usuario), pero su placeholder sí es copy de la interfaz.
  const opaqueContent = ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA'].includes(element.tagName)
  if (element.hasAttribute('data-i18n-skip')) return
  for (const name of ['placeholder', 'aria-label', 'title', 'alt']) {
    if (!element.hasAttribute(name)) continue
    const current = element.getAttribute(name) || ''
    const state = attrState.get(element) || {}
    const valueState = state[name] || { original: current, lastOutput: current }
    if (current !== valueState.lastOutput) valueState.original = current
    const next = locale === 'en' ? translate(valueState.original) : valueState.original
    valueState.lastOutput = next
    state[name] = valueState
    if (current !== next) element.setAttribute(name, next)
    attrState.set(element, state)
  }
  if (opaqueContent) return
  for (const child of element.childNodes) translateNode(child, locale)
}

export function LegacyDomTranslation() {
  const { locale } = useI18n()
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    let busy = false
    let observer = null
    let cancelled = false
    const process = () => {
      if (busy) return
      busy = true
      translateNode(document.body, locale)
      busy = false
    }
    const start = () => {
      if (cancelled) return
      process()
      observer = new MutationObserver(process)
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title', 'alt'] })
    }
    // En español no hace falta la tabla: translateNode solo restaura originales.
    if (locale === 'en') loadPhrases().then(start)
    else start()
    return () => { cancelled = true; observer?.disconnect() }
  }, [locale])
  return null
}

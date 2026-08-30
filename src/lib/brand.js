import { useSyncExternalStore } from 'react'
import { apiFetch } from './api'

/**
 * Marca del panel. El backend la resuelve por dominio antes del login
 * (/api/white-label/public/brand) y por organización dentro de la respuesta de
 * login/refresh. Se cachea en localStorage para que al recargar no se vea un
 * parpadeo con la marca por defecto antes de que responda la red.
 */
const KEY = 'vendrava:brand:v1'

export const DEFAULT_BRAND = Object.freeze({
  brandName: 'Vendrava',
  logoUrl: null,
  primaryColor: '#6366f1',
  accentColor: '#22d3ee',
  textColor: '#ffffff',
})

function stored() {
  try {
    const raw = window.localStorage?.getItem(KEY)
    return raw ? { ...DEFAULT_BRAND, ...JSON.parse(raw) } : DEFAULT_BRAND
  } catch {
    return DEFAULT_BRAND
  }
}

let current = typeof window === 'undefined' ? DEFAULT_BRAND : stored()
const listeners = new Set()

function apply() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--brand-primary', current.primaryColor)
  root.style.setProperty('--brand-accent', current.accentColor)
  root.style.setProperty('--brand-on-primary', current.textColor)
  document.title = current.brandName
  if (current.logoUrl) {
    const icon = document.querySelector('link[rel="icon"]') || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' }))
    icon.href = current.logoUrl
  }
}

export function getBrand() {
  return current
}

export function setBrand(brand) {
  const next = brand ? { ...DEFAULT_BRAND, ...brand } : DEFAULT_BRAND
  if (JSON.stringify(next) === JSON.stringify(current)) return
  current = next
  try {
    if (brand) window.localStorage?.setItem(KEY, JSON.stringify(current))
    else window.localStorage?.removeItem(KEY)
  } catch {
    // Sin localStorage la marca vive sólo en memoria: peor UX, no un error.
  }
  apply()
  listeners.forEach(listener => listener())
}

export function useBrand() {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getBrand,
    () => DEFAULT_BRAND,
  )
}

/** Marca por dominio, para la pantalla de login. 204 = sin marca propia. */
export async function loadBrandForHost() {
  apply()
  try {
    const response = await apiFetch(`/api/white-label/public/brand?host=${encodeURIComponent(window.location.hostname)}`)
    if (response.status === 204) setBrand(null)
    else if (response.ok) setBrand(await response.json())
  } catch {
    // Sin red se queda la marca cacheada.
  }
}

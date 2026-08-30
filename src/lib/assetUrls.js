import { useEffect, useState } from 'react'
import { apiFetch } from './api'

/**
 * Resolución de URLs de activos para elementos multimedia del DOM.
 *
 * `/api/assets/:id/url` devuelve una URL prefirmada del almacén (`requiresAuth:
 * false`) o, cuando no hay S3/R2 configurado, la ruta local `/api/assets/:id/
 * content`, que exige `Authorization: Bearer …`. Ni <img> ni <video> envían esa
 * cabecera: las vistas previas se quedaban en blanco en cualquier despliegue con
 * almacenamiento local. Aquí se descarga con apiFetch y se sirve como `blob:`,
 * que es lo único que un elemento multimedia consume sin cabeceras.
 *
 * La firma caduca, así que se cachea por id con vida limitada; los blobs no
 * caducan, se conservan y se revocan al desalojarlos para no filtrar memoria.
 */

const MAX_ENTRIES = 48
const SIGNED_TTL_MS = 8 * 60 * 1000

const cache = new Map() // assetId -> { url, blob: boolean, at: number }
const inflight = new Map() // assetId -> Promise<string|null>

function drop(assetId) {
  const entry = cache.get(assetId)
  if (!entry) return
  cache.delete(assetId)
  if (entry.blob) URL.revokeObjectURL(entry.url)
}

function remember(assetId, entry) {
  drop(assetId)
  cache.set(assetId, { ...entry, at: Date.now() })
  // Map conserva el orden de inserción: la primera clave es la más antigua.
  while (cache.size > MAX_ENTRIES) drop(cache.keys().next().value)
}

function fresh(entry) {
  return entry.blob || Date.now() - entry.at < SIGNED_TTL_MS
}

async function resolve(assetId) {
  const response = await apiFetch(`/api/assets/${encodeURIComponent(assetId)}/url`)
  if (!response.ok) return null
  const data = await response.json().catch(() => null)
  if (!data?.url) return null
  if (!data.requiresAuth) return { url: data.url, blob: false }
  const content = await apiFetch(data.url)
  if (!content.ok) return null
  return { url: URL.createObjectURL(await content.blob()), blob: true }
}

/** Devuelve una URL utilizable en src=, o null si el activo no es legible. */
export function assetUrl(assetId) {
  if (!assetId) return Promise.resolve(null)
  const hit = cache.get(assetId)
  if (hit && fresh(hit)) {
    // Refresco de recencia para que el desalojo sea LRU y no FIFO.
    cache.delete(assetId)
    cache.set(assetId, hit)
    return Promise.resolve(hit.url)
  }
  const pending = inflight.get(assetId)
  if (pending) return pending
  const promise = resolve(assetId)
    .then(entry => {
      if (!entry) return null
      remember(assetId, entry)
      return entry.url
    })
    .catch(() => null)
    .finally(() => inflight.delete(assetId))
  inflight.set(assetId, promise)
  return promise
}

/** `state`: idle | loading | ready | error. */
export function useAssetUrl(assetId, enabled = true) {
  const [value, setValue] = useState({ url: null, state: 'idle' })
  useEffect(() => {
    if (!assetId || !enabled) {
      setValue({ url: null, state: 'idle' })
      return undefined
    }
    let active = true
    setValue(current => (current.state === 'ready' ? current : { url: null, state: 'loading' }))
    assetUrl(assetId).then(url => {
      if (active) setValue({ url, state: url ? 'ready' : 'error' })
    })
    return () => { active = false }
  }, [assetId, enabled])
  return value
}

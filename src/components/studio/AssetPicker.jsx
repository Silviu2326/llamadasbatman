import { useEffect, useMemo, useState } from 'react'
import { RiCloseLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { getLocale, localeCode } from '../../i18n'

/**
 * Selector de activos de la biblioteca. Los formularios del Studio pedían el
 * identificador del activo escrito a mano (`asset-1, asset-2`, «Asset de
 * subtítulos»): nadie conoce de memoria un cuid. Aquí se listan los activos
 * reales de la organización por tipo, y queda una vía manual para pegar un id
 * que no esté entre los recientes.
 */

const MANUAL = '__manual__'
const cache = new Map() // kind -> items

function formatWhen(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(localeCode(getLocale()), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let size = bytes
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function assetLabel(asset) {
  if (!asset) return ''
  return [
    asset.id.slice(0, 8),
    asset.provider || asset.model || asset.kind,
    formatWhen(asset.createdAt),
    formatBytes(asset.bytes),
  ].filter(Boolean).join(' · ')
}

async function loadKind(kind) {
  if (cache.has(kind)) return cache.get(kind)
  const response = await apiFetch(`/api/assets?kind=${encodeURIComponent(kind)}&limit=60`)
  if (!response.ok) throw new Error('assets')
  const data = await response.json().catch(() => null)
  const list = Array.isArray(data?.items) ? data.items : []
  cache.set(kind, list)
  return list
}

/**
 * `kind` admite varios tipos: los subtítulos llegan como `document` o como
 * `text` según cómo se subieran, y obligar a elegir uno escondía la mitad de la
 * biblioteca (backend/src/services/studioPost.service.ts acepta ambos MIME).
 */
function useAssets(kind, enabled = true) {
  // La dependencia del efecto es la CADENA de tipos, nunca el array: quien usa
  // el selector escribe `kind={['image', 'video']}` en línea, así que el array
  // cambia de identidad en cada render. Con él en las dependencias, el efecto
  // volvía a llamar a setItems con una lista nueva, eso repintaba, y el ciclo
  // no paraba nunca.
  const key = Array.isArray(kind) ? kind.join(',') : String(kind)
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    setState('loading')
    Promise.all(key.split(',').map(loadKind))
      .then(lists => {
        if (!active) return
        setItems(lists.flat().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))))
        setState('ready')
      })
      .catch(() => { if (active) setState('error') })
    return () => { active = false }
  }, [key, enabled])

  return {
    items,
    state,
  }
}

export function AssetPicker({ kind, value, onChange, label, hint, placeholder = 'Sin seleccionar', extra = [], disabled = false, required = false }) {
  const { items, state } = useAssets(kind)
  const [manual, setManual] = useState(false)

  const options = useMemo(() => {
    const seen = new Set()
    return [...extra, ...items].filter(asset => {
      if (!asset?.id || seen.has(asset.id)) return false
      seen.add(asset.id)
      return true
    })
  }, [extra, items])

  // Un id guardado que ya no esté entre los recientes no debe desaparecer del
  // control: se ofrece como opción propia para no perder la selección.
  const orphan = value && !options.some(asset => asset.id === value) ? value : ''

  return (
    <div className="studio-field studio-asset-picker">
      <span>
        {label}{required ? ' *' : ''}
      </span>
      {manual ? (
        <div className="studio-inline-row">
          <input
            value={value}
            onChange={event => onChange(event.target.value.trim())}
            placeholder="Pega un id de activo"
            disabled={disabled}
          />
          <button type="button" className="studio-button ghost small" onClick={() => setManual(false)}>Volver a la lista</button>
        </div>
      ) : (
        <select
          value={value || ''}
          disabled={disabled}
          onChange={event => {
            if (event.target.value === MANUAL) { setManual(true); return }
            onChange(event.target.value)
          }}
        >
          <option value="">{state === 'loading' ? 'Cargando activos…' : placeholder}</option>
          {orphan ? <option value={orphan}>{orphan.slice(0, 8)} · seleccionado</option> : null}
          {options.map(asset => (
            <option key={asset.id} value={asset.id}>{asset.label || assetLabel(asset)}</option>
          ))}
          <option value={MANUAL}>Escribir un id…</option>
        </select>
      )}
      {hint ? <small>{hint}</small> : null}
      {state === 'error' ? <small className="studio-hint-bad">No se pudo leer la biblioteca de activos.</small> : null}
      {state === 'ready' && !options.length && !orphan ? (
        <small className="studio-hint-bad">
          No hay activos de tipo «{Array.isArray(kind) ? kind.join(' / ') : kind}» en la biblioteca todavía.
        </small>
      ) : null}
    </div>
  )
}

export function AssetMultiPicker({ kind, values, onChange, label, hint }) {
  const { items, state } = useAssets(kind)
  const byId = useMemo(() => new Map(items.map(asset => [asset.id, asset])), [items])

  function add(id) {
    if (!id || values.includes(id)) return
    onChange([...values, id])
  }

  return (
    <div className="studio-field studio-field-wide">
      <span>{label}</span>
      <select value="" onChange={event => add(event.target.value)}>
        <option value="">{state === 'loading' ? 'Cargando activos…' : 'Añadir una referencia…'}</option>
        {items.filter(asset => !values.includes(asset.id)).map(asset => (
          <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>
        ))}
      </select>
      {values.length ? (
        <ul className="studio-chip-list">
          {values.map(id => (
            <li key={id}>
              <span>{byId.get(id) ? assetLabel(byId.get(id)) : id.slice(0, 12)}</span>
              <button type="button" onClick={() => onChange(values.filter(value => value !== id))} aria-label={`Quitar ${id}`}>
                <RiCloseLine />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {hint ? <small>{hint}</small> : null}
    </div>
  )
}

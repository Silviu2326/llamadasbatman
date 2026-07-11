import { useState, useEffect, useMemo } from 'react'
import {
  RiSearchLine, RiMapPin2Line, RiStarFill, RiGlobalLine, RiPhoneLine,
  RiDownload2Line, RiCompass3Line, RiFileDownloadLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { downloadCsv } from '../lib/csv'
import '../dashboard.css'

const SORT_OPTIONS = [
  { value: 'quickScore', label: 'Oportunidad' },
  { value: 'rating', label: 'Rating' },
  { value: 'userRatingCount', label: 'Reseñas' },
]

export default function ProspectFinderPage() {
  const [sector, setSector] = useState('')
  const [city, setCity] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [autoAudit, setAutoAudit] = useState(false)
  const [autoCall, setAutoCall] = useState(false)

  const [sortBy, setSortBy] = useState('quickScore')
  const [minRating, setMinRating] = useState('')
  const [minReviews, setMinReviews] = useState('')
  const [onlyNoWebsite, setOnlyNoWebsite] = useState(false)
  const [onlyWithPhone, setOnlyWithPhone] = useState(false)

  useEffect(() => {
    apiFetch('/api/campaigns').then(r => r.ok ? r.json() : []).then(setCampaigns).catch(() => {})
  }, [])

  const visible = useMemo(() => {
    let list = results.filter(r => {
      if (minRating && (r.rating == null || r.rating < Number(minRating))) return false
      if (minReviews && (r.userRatingCount == null || r.userRatingCount < Number(minReviews))) return false
      if (onlyNoWebsite && r.website) return false
      if (onlyWithPhone && !r.phone) return false
      return true
    })
    list = [...list].sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1))
    return list
  }, [results, sortBy, minRating, minReviews, onlyNoWebsite, onlyWithPhone])

  async function handleSearch(e) {
    e.preventDefault()
    if (!sector.trim() || !city.trim()) return
    setLoading(true); setError(''); setResults([]); setSelected(new Set()); setImported(0); setSkipped(0)
    try {
      const res = await apiFetch('/api/prospects/search', {
        method: 'POST',
        body: JSON.stringify({ sector: sector.trim(), city: city.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Búsqueda no disponible')
      }
      const data = await res.json()
      setResults(data.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggle(placeId) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(placeId) ? next.delete(placeId) : next.add(placeId)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === visible.length ? new Set() : new Set(visible.map(r => r.placeId)))
  }

  async function handleImport() {
    const items = visible.filter(r => selected.has(r.placeId))
    if (!items.length) return
    setImporting(true); setError('')
    try {
      const res = await apiFetch('/api/prospects/import', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: campaignId || undefined,
          sector: sector.trim(), city: city.trim(),
          enrich: true, autoAudit, autoCall,
          items,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setImported(data.imported || 0)
      setSkipped(data.skipped || 0)
      const importedIds = new Set(items.map(i => i.placeId))
      setResults(prev => prev.filter(r => !importedIds.has(r.placeId)))
      setSelected(new Set())
    } catch {
      setError('No se pudo importar los leads seleccionados')
    } finally {
      setImporting(false)
    }
  }

  function handleExportCsv() {
    downloadCsv(`prospectos-${sector}-${city}.csv`, visible.map(r => ({
      nombre: r.name, direccion: r.address ?? '', telefono: r.phone ?? '',
      web: r.website ?? '', rating: r.rating ?? '', resenas: r.userRatingCount ?? '',
      oportunidad: r.quickScore, maps: r.mapsUri ?? '',
    })))
  }

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#4f46e5,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RiCompass3Line style={{ width: 17, height: 17, color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Prospect Finder</h1>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>Busca negocios por sector y ciudad, e impórtalos como leads</p>
        </div>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: 16 }}>
        <input
          value={sector} onChange={e => setSector(e.target.value)}
          placeholder="Sector (ej. clínicas dentales)"
          style={{ flex: '1 1 220px', background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
        />
        <input
          value={city} onChange={e => setCity(e.target.value)}
          placeholder="Ciudad (ej. Valencia)"
          style={{ flex: '1 1 180px', background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
        />
        <button type="submit" disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: 'none',
          background: loading ? '#374151' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', fontSize: 13,
          fontWeight: 600, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>
          <RiSearchLine style={{ width: 14, height: 14 }} />
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {results.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '6px 10px', color: '#94a3b8', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>Ordenar por {o.label}</option>)}
          </select>
          <input value={minRating} onChange={e => setMinRating(e.target.value)} type="number" step="0.1" min="0" max="5" placeholder="Rating mín." style={{ width: 100, background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '6px 10px', color: '#e2e8f0', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
          <input value={minReviews} onChange={e => setMinReviews(e.target.value)} type="number" min="0" placeholder="Reseñas mín." style={{ width: 110, background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '6px 10px', color: '#e2e8f0', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyNoWebsite} onChange={e => setOnlyNoWebsite(e.target.checked)} /> Sin web
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyWithPhone} onChange={e => setOnlyWithPhone(e.target.checked)} /> Con teléfono
          </label>
          <div style={{ flex: 1 }} />
          <button onClick={handleExportCsv} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
            border: '1px solid #1e2433', background: '#111827', color: '#94a3b8', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <RiFileDownloadLine style={{ width: 13, height: 13 }} /> Exportar CSV
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: '#ef444415', border: '1px solid #ef444440', borderRadius: 10, color: '#ef4444', fontSize: 12.5, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {(imported > 0 || skipped > 0) && (
        <div style={{ padding: '10px 14px', background: '#10b98115', border: '1px solid #10b98140', borderRadius: 10, color: '#10b981', fontSize: 12.5, marginBottom: 16 }}>
          {imported} lead(s) importado(s) correctamente.{skipped > 0 ? ` ${skipped} omitido(s) por estar ya importado(s).` : ''}
        </div>
      )}

      {visible.length > 0 && (
        <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #1e2433', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.size === visible.length && visible.length > 0} onChange={toggleAll} />
              {selected.size} / {visible.length} seleccionados
            </label>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)} style={{
              background: '#111827', border: '1px solid #1e2433', borderRadius: 8, padding: '6px 10px',
              color: '#94a3b8', fontSize: 12, outline: 'none', fontFamily: 'inherit',
            }}>
              <option value="">Sin campaña</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoAudit} onChange={e => setAutoAudit(e.target.checked)} /> Auditar al importar
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoCall} onChange={e => setAutoCall(e.target.checked)} /> Llamar automáticamente
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={handleImport} disabled={!selected.size || importing} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none',
              background: !selected.size || importing ? '#374151' : '#10b981', color: '#fff', fontSize: 12.5,
              fontWeight: 600, cursor: !selected.size || importing ? 'default' : 'pointer', fontFamily: 'inherit',
            }}>
              <RiDownload2Line style={{ width: 13, height: 13 }} />
              {importing ? 'Importando…' : 'Importar seleccionados'}
            </button>
          </div>

          {visible.map(r => (
            <div key={r.placeId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderBottom: '1px solid #111827' }}>
              <input type="checkbox" checked={selected.has(r.placeId)} onChange={() => toggle(r.placeId)} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: r.quickScore >= 60 ? '#ef4444' : r.quickScore >= 30 ? '#f59e0b' : '#3b82f6', background: (r.quickScore >= 60 ? '#ef4444' : r.quickScore >= 30 ? '#f59e0b' : '#3b82f6') + '18', border: `1px solid ${(r.quickScore >= 60 ? '#ef4444' : r.quickScore >= 30 ? '#f59e0b' : '#3b82f6')}40`, borderRadius: 99, padding: '2px 8px', flexShrink: 0 }}>
                {r.quickScore}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{r.name}</p>
                {r.address && (
                  <p style={{ margin: 0, fontSize: 11.5, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <RiMapPin2Line style={{ width: 12, height: 12 }} /> {r.address}
                  </p>
                )}
              </div>
              {r.phone && (
                <span style={{ fontSize: 11.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <RiPhoneLine style={{ width: 12, height: 12 }} /> {r.phone}
                </span>
              )}
              {r.website && (
                <a href={r.website} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#818cf8', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, textDecoration: 'none' }}>
                  <RiGlobalLine style={{ width: 12, height: 12 }} /> Web
                </a>
              )}
              {r.rating != null && (
                <span style={{ fontSize: 11.5, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <RiStarFill style={{ width: 11, height: 11 }} /> {r.rating} ({r.userRatingCount ?? 0})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import FormModal from '../components/ui/FormModal'
import FormSelect from '../components/forms/FormSelect'
import { apiFetch } from '../lib/api'

const POLL_MS = 2000

export default function ImportLeadsModal({ onClose, onSuccess }) {
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState('')
  const [file, setFile] = useState(null)
  const [autoCall, setAutoCall] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [job, setJob] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    apiFetch('/api/campaigns').then(r => r.ok ? r.json() : []).then(data => {
      const list = Array.isArray(data) ? data : []
      setCampaigns(list)
      if (list.length) setCampaignId(list[0].id)
    }).catch(() => {})
  }, [])

  // LE-103: el import es asíncrono (ImportJob) — mientras esté pending/processing
  // se hace polling cada 2s del estado hasta llegar a completed/failed.
  useEffect(() => {
    if (!job || job.status === 'completed' || job.status === 'failed') return
    pollRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/leads/imports/${job.id}`)
        if (res.ok) setJob(await res.json())
      } catch { /* se reintenta en el próximo tick */ }
    }, POLL_MS)
    return () => clearTimeout(pollRef.current)
  }, [job])

  async function handleSubmit() {
    if (job) { onSuccess ? onSuccess(job) : onClose(); return }
    if (!campaignId) { setError('Elegí una campaña'); return }
    if (!file) { setError('Elegí un archivo CSV'); return }
    setSaving(true)
    setError(null)
    try {
      const text = await file.text()
      const res = await apiFetch(`/api/leads/import?campaignId=${campaignId}&autoCall=${autoCall}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      })
      if (!res.ok) { setError('Error al importar el CSV'); return }
      const created = await res.json()
      setJob(created)
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const isDone = job && (job.status === 'completed' || job.status === 'failed')
  const isRunning = job && !isDone
  const errorList = Array.isArray(job?.errors) ? job.errors : []

  return (
    <FormModal
      title="Importar leads desde CSV"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitText={isDone ? 'Cerrar' : isRunning ? 'Procesando…' : saving ? 'Enviando…' : 'Importar'}
      submitDisabled={isRunning}
    >
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}

      {!job && <>
        <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>Columnas esperadas: name, phone, email, company.</p>
        <FormSelect
          label="Campaña"
          value={campaignId}
          onChange={e => setCampaignId(e.target.value)}
          options={campaigns.map(c => ({ value: c.id, label: c.name }))}
        />
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={e => setFile(e.target.files[0] ?? null)}
          style={{ color: '#94a3b8', fontSize: 13 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoCall} onChange={e => setAutoCall(e.target.checked)} /> Llamar automáticamente a los importados
        </label>
      </>}

      {job && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
          <span>{isRunning ? 'Importando…' : job.status === 'completed' ? 'Importación completada' : 'Importación con errores'}</span>
          <span>{job.processedRows ?? 0} / {job.totalRows ?? 0} filas</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: '#1f2937', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${job.totalRows ? Math.min(100, ((job.processedRows ?? 0) / job.totalRows) * 100) : isDone ? 100 : 0}%`,
            background: job.status === 'failed' ? '#ef4444' : '#34d399',
            transition: 'width .3s ease',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <span style={{ color: '#34d399' }}>Importados: {job.importedCount ?? 0}</span>
          <span style={{ color: '#f59e0b' }}>Duplicados: {job.skippedCount ?? 0}</span>
          <span style={{ color: '#ef4444' }}>Errores: {job.errorCount ?? 0}</span>
        </div>
        {isDone && errorList.length > 0 && (
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #1f2937', borderRadius: 8, padding: 8 }}>
            {errorList.map((err, index) => (
              <div key={index} style={{ fontSize: 12, color: '#94a3b8' }}>Fila {err.row}: {err.message}</div>
            ))}
          </div>
        )}
      </div>}
    </FormModal>
  )
}

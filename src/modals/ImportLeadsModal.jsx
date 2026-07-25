import { useState, useEffect, useRef } from 'react'
import FormModal from '../components/ui/FormModal'
import FormSelect from '../components/forms/FormSelect'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

const POLL_MS = 2000

export default function ImportLeadsModal({ onClose, onSuccess }) {
  const { t } = useI18n()
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState('')
  const [file, setFile] = useState(null)
  const [autoCall, setAutoCall] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [job, setJob] = useState(null)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    apiFetch('/api/campaigns').then(r => r.ok ? r.json() : []).then(data => {
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
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

  async function createCampaignInline() {
    setCreatingCampaign(true)
    setError(null)
    try {
      const res = await apiFetch('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: newCampaignName.trim() }) })
      if (!res.ok) throw new Error()
      const created = await res.json()
      setCampaigns([created])
      setCampaignId(created.id)
      setNewCampaignName('')
    } catch {
      setError('No se pudo crear la campaña. Inténtalo de nuevo.')
    } finally {
      setCreatingCampaign(false)
    }
  }

  async function handleSubmit() {
    if (job) { onSuccess ? onSuccess(job) : onClose(); return }
    if (!campaignId) { setError(t('modal.campaignRequired')); return }
    if (!file) { setError(t('modal.fileRequired')); return }
    setSaving(true)
    setError(null)
    try {
      const text = await file.text()
      const res = await apiFetch(`/api/leads/import?campaignId=${campaignId}&autoCall=${autoCall}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      })
      if (!res.ok) { setError(t('modal.importError')); return }
      const created = await res.json()
      setJob(created)
    } catch {
      setError(t('modal.connectionError'))
    } finally {
      setSaving(false)
    }
  }

  const isDone = job && (job.status === 'completed' || job.status === 'failed')
  const isRunning = job && !isDone
  const errorList = Array.isArray(job?.errors) ? job.errors : []

  return (
    <FormModal
      title={t('modal.importLeads')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitText={isDone ? t('common.close') : isRunning ? t('modal.processing') : saving ? t('modal.sending') : t('modal.import')}
      submitDisabled={isRunning}
    >
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}

      {!job && <>
        <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>{t('modal.expectedColumns')}</p>
        {campaigns.length > 0 && <FormSelect
          label={t('modal.campaign')}
          value={campaignId}
          onChange={e => setCampaignId(e.target.value)}
          options={campaigns.map(c => ({ value: c.id, label: c.name }))}
        />}
        {campaigns.length === 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#94a3b8' }}>Todavía no tienes campañas. Crea una aquí mismo para agrupar estos leads:</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newCampaignName}
              onChange={e => setNewCampaignName(e.target.value)}
              placeholder="Nombre de la campaña (ej. Leads web julio)"
              style={{ flex: 1, background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }}
            />
            <button
              type="button"
              disabled={!newCampaignName.trim() || creatingCampaign}
              onClick={createCampaignInline}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: !newCampaignName.trim() || creatingCampaign ? 'not-allowed' : 'pointer', opacity: !newCampaignName.trim() || creatingCampaign ? 0.6 : 1 }}
            >{creatingCampaign ? 'Creando…' : 'Crear'}</button>
          </div>
        </div>}
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={e => setFile(e.target.files[0] ?? null)}
          style={{ color: '#94a3b8', fontSize: 13 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoCall} onChange={e => setAutoCall(e.target.checked)} /> {t('modal.autoCall')}
        </label>
      </>}

      {job && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
          <span>{isRunning ? t('modal.importing') : job.status === 'completed' ? t('modal.importCompleted') : t('modal.importErrors')}</span>
          <span>{job.processedRows ?? 0} / {job.totalRows ?? 0} {t('modal.rows')}</span>
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
          <span style={{ color: '#34d399' }}>{t('modal.imported')}: {job.importedCount ?? 0}</span>
          <span style={{ color: '#f59e0b' }}>{t('modal.duplicates')}: {job.skippedCount ?? 0}</span>
          <span style={{ color: '#ef4444' }}>{t('modal.errors')}: {job.errorCount ?? 0}</span>
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

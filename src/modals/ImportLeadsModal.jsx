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
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}

      {!job && <>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)' }}>{t('modal.expectedColumns')}</p>
        {campaigns.length > 0 && <FormSelect
          label={t('modal.campaign')}
          value={campaignId}
          onChange={e => setCampaignId(e.target.value)}
          options={campaigns.map(c => ({ value: c.id, label: c.name }))}
        />}
        {campaigns.length === 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Todavía no tienes campañas. Crea una aquí mismo para agrupar estos leads:</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={newCampaignName}
              onChange={e => setNewCampaignName(e.target.value)}
              placeholder="Nombre de la campaña (ej. Leads web julio)"
              style={{ flex: '1 1 140px', minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
            />
            <button
              type="button"
              disabled={!newCampaignName.trim() || creatingCampaign}
              onClick={createCampaignInline}
              style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))', color: '#fff', fontSize: 13, fontWeight: 700, cursor: !newCampaignName.trim() || creatingCampaign ? 'not-allowed' : 'pointer', opacity: !newCampaignName.trim() || creatingCampaign ? 0.6 : 1 }}
            >{creatingCampaign ? 'Creando…' : 'Crear'}</button>
          </div>
        </div>}
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={e => setFile(e.target.files[0] ?? null)}
          style={{ color: 'var(--muted)', fontSize: 13 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoCall} onChange={e => setAutoCall(e.target.checked)} /> {t('modal.autoCall')}
        </label>
      </>}

      {job && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
          <span>{isRunning ? t('modal.importing') : job.status === 'completed' ? t('modal.importCompleted') : t('modal.importErrors')}</span>
          <span>{job.processedRows ?? 0} / {job.totalRows ?? 0} {t('modal.rows')}</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${job.totalRows ? Math.min(100, ((job.processedRows ?? 0) / job.totalRows) * 100) : isDone ? 100 : 0}%`,
            background: job.status === 'failed' ? 'var(--danger)' : 'var(--success)',
            transition: 'width .3s ease',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ color: 'var(--success)' }}>{t('modal.imported')}: {job.importedCount ?? 0}</span>
          <span style={{ color: 'var(--warn)' }}>{t('modal.duplicates')}: {job.skippedCount ?? 0}</span>
          <span style={{ color: 'var(--danger)' }}>{t('modal.errors')}: {job.errorCount ?? 0}</span>
        </div>
        {isDone && errorList.length > 0 && (
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
            {errorList.map((err, index) => (
              <div key={index} style={{ fontSize: 12, color: 'var(--muted)' }}>Fila {err.row}: {err.message}</div>
            ))}
          </div>
        )}
      </div>}
    </FormModal>
  )
}

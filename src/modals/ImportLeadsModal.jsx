import { useState, useEffect, useRef } from 'react'
import FormModal from '../components/ui/FormModal'
import FormSelect from '../components/forms/FormSelect'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'
import {
  IMPORT_ACCEPT, IMPORT_POLL_MS, IMPORT_POLL_TIMEOUT_MS, buildImportQuery, describeImportError, detectStalledImport,
  importFileKind, importProgress, stalledImportMessage, summarizeImportErrors,
} from '../lib/leadImport'

const NEW_CAMPAIGN = '__new__'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(file)
  })
}

const inputStyle = { width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }
const checkboxStyle = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }

export default function ImportLeadsModal({ onClose, onSuccess, initialCampaignId = '' }) {
  const { t } = useI18n()
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState(initialCampaignId)
  const [file, setFile] = useState(null)
  const [autoCall, setAutoCall] = useState(false)
  const [consentVoice, setConsentVoice] = useState(false)
  const [consentSource, setConsentSource] = useState('')
  const [consentEvidence, setConsentEvidence] = useState('')
  const [attachExisting, setAttachExisting] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [job, setJob] = useState(null)
  const [mapping, setMapping] = useState(null)
  const [stalled, setStalled] = useState(false)
  const [newCampaignName, setNewCampaignName] = useState('')
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const pollRef = useRef(null)
  const progressRef = useRef({ processed: -1, at: 0, startedAt: 0 })

  useEffect(() => {
    apiFetch('/api/campaigns').then(r => r.ok ? r.json() : []).then(data => {
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
      setCampaigns(list)
      setCampaignId(current => (current && list.some(c => c.id === current)) ? current : (list.length ? list[0].id : NEW_CAMPAIGN))
    }).catch(() => {})
  }, [])

  // LE-103: el import es asíncrono (ImportJob) — mientras esté pending/processing
  // se hace polling cada 2s del estado hasta llegar a completed/failed. Si en
  // un minuto no avanza ninguna fila, se avisa de que el worker de
  // importaciones no lo está procesando; pasado el tope se deja de preguntar.
  useEffect(() => {
    if (!job || importProgress(job).done) return
    const now = Date.now()
    const processed = Number(job.processedRows) || 0
    if (!progressRef.current.startedAt) progressRef.current = { processed, at: now, startedAt: now }
    else if (processed !== progressRef.current.processed) progressRef.current = { ...progressRef.current, processed, at: now }
    setStalled(detectStalledImport({ job, lastProgressAt: progressRef.current.at, now }))
    if (now - progressRef.current.startedAt >= IMPORT_POLL_TIMEOUT_MS) return
    pollRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/leads/imports/${job.id}`)
        if (res.ok) setJob(await res.json())
        else setJob(current => ({ ...current }))
      } catch { setJob(current => ({ ...current })) }
    }, IMPORT_POLL_MS)
    return () => clearTimeout(pollRef.current)
  }, [job])

  async function createCampaignInline() {
    setCreatingCampaign(true)
    setError(null)
    try {
      const res = await apiFetch('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: newCampaignName.trim() }) })
      if (!res.ok) throw new Error()
      const created = await res.json()
      setCampaigns(current => [created, ...current])
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
    if (!campaignId || campaignId === NEW_CAMPAIGN) { setError(t('modal.campaignRequired')); return }
    if (!file) { setError(t('modal.fileRequired')); return }
    const kind = importFileKind(file.name)
    if (!kind) { setError('Formato no soportado: sube un .csv o un .xlsx.'); return }
    if (consentVoice && !consentSource.trim()) { setError('Indica la base legal (fuente) del consentimiento de voz para este lote.'); return }
    setSaving(true)
    setError(null)
    try {
      const query = buildImportQuery({ campaignId, autoCall, consentVoice, consentSource, consentEvidence, attachExisting })
      // El CSV viaja como texto plano; el XLSX como JSON base64 (Fastify no
      // parsea binario sin un content-type parser propio).
      const res = kind === 'xlsx'
        ? await apiFetch(`/api/leads/import?${query}`, { method: 'POST', body: JSON.stringify({ fileName: file.name, contentBase64: await fileToBase64(file) }) })
        : await apiFetch(`/api/leads/import?${query}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: await file.text() })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error || t('modal.importError'))
        return
      }
      const created = await res.json()
      setMapping(created.mapping || null)
      progressRef.current = { processed: -1, at: 0, startedAt: 0 }
      setJob(created)
    } catch {
      setError(t('modal.connectionError'))
    } finally {
      setSaving(false)
    }
  }

  const progress = importProgress(job)
  const isDone = progress.done
  const isRunning = job && !isDone
  const errorList = Array.isArray(job?.errors) ? job.errors : []
  const errorSummary = summarizeImportErrors(errorList)
  const mappedFields = mapping ? Object.entries(mapping).filter(([, header]) => header) : []

  return (
    <FormModal
      title={t('modal.importLeads')}
      onClose={onClose}
      onSubmit={handleSubmit}
      size="lg"
      submitText={isDone || (isRunning && stalled) ? t('common.close') : isRunning ? t('modal.processing') : saving ? t('modal.sending') : t('modal.import')}
      submitDisabled={isRunning && !stalled}
    >
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}

      {!job && <>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)' }}>
          Archivo CSV (separado por «,» o «;») o Excel .xlsx. Columnas reconocidas: nombre (o nombre + apellidos), teléfono, email, empresa; opcionalmente <code>consent_voice</code> (sí/no), <code>consent_source</code> y <code>consent_evidence</code>. Los teléfonos se normalizan a formato internacional (+34 por defecto) y los contactos que ya existen en el CRM no se duplican.
        </p>
        <FormSelect
          label={t('modal.campaign')}
          value={campaignId}
          onChange={e => setCampaignId(e.target.value)}
          options={[...campaigns.map(c => ({ value: c.id, label: c.name })), { value: NEW_CAMPAIGN, label: '+ Crear campaña nueva…' }]}
        />
        {campaignId === NEW_CAMPAIGN && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>{campaigns.length ? 'Nombre de la campaña que agrupará estos leads:' : 'Todavía no tienes campañas. Crea una aquí mismo para agrupar estos leads:'}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={newCampaignName}
              onChange={e => setNewCampaignName(e.target.value)}
              placeholder="Nombre de la campaña (ej. Leads web julio)"
              style={{ ...inputStyle, flex: '1 1 140px', width: 'auto', minWidth: 0 }}
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
          accept={IMPORT_ACCEPT}
          onChange={e => setFile(e.target.files[0] ?? null)}
          style={{ color: 'var(--muted)', fontSize: 13 }}
        />
        <label style={checkboxStyle}>
          <input type="checkbox" checked={attachExisting} onChange={e => setAttachExisting(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Si un contacto ya existe en el CRM sin campaña, asignarlo a esta campaña (no se crea duplicado).</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--line)', borderRadius: 9 }}>
          <label style={checkboxStyle}>
            <input type="checkbox" checked={consentVoice} onChange={e => setConsentVoice(e.target.checked)} style={{ marginTop: 2 }} />
            <span><strong style={{ color: 'var(--text)' }}>Tengo base legal para llamar a estos contactos</strong> (consentimiento previo, relación contractual o interés legítimo documentado). Se registrará consentimiento de voz para todo el lote con la fuente y evidencia indicadas. Sin esta casilla, los números españoles no se llamarán hasta registrar consentimiento en cada ficha.</span>
          </label>
          {consentVoice && <>
            <input value={consentSource} onChange={e => setConsentSource(e.target.value)} maxLength={120} placeholder="Fuente (ej. contrato de servicio 2025, formulario web, feria)" style={inputStyle} />
            <input value={consentEvidence} onChange={e => setConsentEvidence(e.target.value)} maxLength={2000} placeholder="Evidencia (ej. cláusula 3 del contrato, URL del formulario, fecha)" style={inputStyle} />
          </>}
        </div>
        <label style={checkboxStyle}>
          <input type="checkbox" checked={autoCall} onChange={e => setAutoCall(e.target.checked)} style={{ marginTop: 2 }} /> <span>{t('modal.autoCall')}</span>
        </label>
      </>}

      {job && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
          <span>{isRunning ? (job.status === 'pending' ? 'En cola…' : t('modal.importing')) : job.status === 'completed' ? t('modal.importCompleted') : t('modal.importErrors')}</span>
          <span>{job.processedRows ?? 0} / {job.totalRows ?? 0} {t('modal.rows')} · {progress.percent}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-hover)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progress.percent}%`,
            background: job.status === 'failed' ? 'var(--danger)' : 'var(--success)',
            transition: 'width .3s ease',
          }} />
        </div>
        {stalled && isRunning && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: 'var(--warn)' }}>{stalledImportMessage(job)}</p>}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          <span style={{ color: 'var(--success)' }}>{t('modal.imported')}: {job.importedCount ?? 0}</span>
          <span style={{ color: 'var(--warn)' }}>Omitidos (ya existían o repetidos): {job.skippedCount ?? 0}</span>
          <span style={{ color: 'var(--danger)' }}>{t('modal.errors')}: {job.errorCount ?? 0}</span>
        </div>
        {mappedFields.length > 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--dim)' }}>Columnas usadas: {mappedFields.map(([field, header]) => `${field} ← «${header}»`).join(', ')}.</p>}
        {isDone && errorList.length > 0 && (
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(errorSummary.invalidPhone > 0 || errorSummary.alreadyExists > 0 || errorSummary.duplicateInFile > 0) && <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              {errorSummary.invalidPhone > 0 && <span>{errorSummary.invalidPhone} con teléfono no válido · </span>}
              {errorSummary.alreadyExists > 0 && <span>{errorSummary.alreadyExists} ya existían · </span>}
              {errorSummary.duplicateInFile > 0 && <span>{errorSummary.duplicateInFile} repetidos en el archivo</span>}
            </div>}
            {errorList.map((err, index) => (
              <div key={index} style={{ fontSize: 12, color: 'var(--muted)' }}>Fila {err.row}: {describeImportError(err.message)}</div>
            ))}
          </div>
        )}
        {isDone && job.status === 'completed' && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)' }}>Los leads importados aparecen en el CRM. En cada ficha verás si el agente puede llamarlos y, si no, por qué.</p>}
      </div>}
    </FormModal>
  )
}

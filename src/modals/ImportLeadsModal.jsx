import { useState, useEffect } from 'react'
import FormModal from '../components/ui/FormModal'
import FormSelect from '../components/forms/FormSelect'
import { apiFetch } from '../lib/api'

export default function ImportLeadsModal({ onClose, onSuccess }) {
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState('')
  const [file, setFile] = useState(null)
  const [autoCall, setAutoCall] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFetch('/api/campaigns').then(r => r.ok ? r.json() : []).then(data => {
      const list = Array.isArray(data) ? data : []
      setCampaigns(list)
      if (list.length) setCampaignId(list[0].id)
    }).catch(() => {})
  }, [])

  async function handleSubmit() {
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
      const result = await res.json()
      onSuccess ? onSuccess(result) : onClose()
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormModal title="Importar leads desde CSV" onClose={onClose} onSubmit={handleSubmit} submitText={saving ? 'Importando…' : 'Importar'}>
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}
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
    </FormModal>
  )
}

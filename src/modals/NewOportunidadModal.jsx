import { useState, useEffect, useRef } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

const ETAPAS = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
const ETAPAS_LABEL = ['Lead', 'Calificado', 'Propuesta', 'Negociación', 'Cerrado (ganado)', 'Cerrado (perdido)']

export default function NewOportunidadModal({ onClose, onSuccess }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ company: '', stage: 'lead', value: '', score: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // LE-07: usar un lead ya existente en vez de crear uno nuevo siempre.
  const [leadMode, setLeadMode] = useState('new') // 'new' | 'existing'
  const [leadSearch, setLeadSearch] = useState('')
  const [leadResults, setLeadResults] = useState([])
  const [searchingLeads, setSearchingLeads] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const searchTimer = useRef(null)

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  useEffect(() => {
    if (leadMode !== 'existing') return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const term = leadSearch.trim()
    if (!term) { setLeadResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearchingLeads(true)
      try {
        const res = await apiFetch(`/api/leads?search=${encodeURIComponent(term)}&limit=10`)
        if (res.ok) {
          const data = await res.json()
          setLeadResults(data.data ?? [])
        }
      } catch { /* ignora errores de búsqueda, el usuario puede reintentar */ }
      finally { setSearchingLeads(false) }
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [leadSearch, leadMode])

  function pickLead(lead) {
    setSelectedLead(lead)
    setLeadSearch(lead.name || lead.email || lead.phone || '')
    setLeadResults([])
  }

  function switchMode(mode) {
    setLeadMode(mode)
    setSelectedLead(null)
    setLeadSearch('')
    setLeadResults([])
    setError(null)
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      let leadId
      let name = form.company

      if (leadMode === 'existing') {
        if (!selectedLead) { setError(t('modal.selectExistingLead')); return }
        leadId = selectedLead.id
        name = form.company || selectedLead.name
      } else {
        // Create lead first since Opportunity.leadId is required
        const leadRes = await apiFetch('/api/leads', {
          method: 'POST',
          body: JSON.stringify({ name: form.company }),
        })
        if (!leadRes.ok) { setError(t('modal.createError')); return }
        const lead = await leadRes.json()
        leadId = lead.id
      }

      const res = await apiFetch('/api/pipeline', {
        method: 'POST',
        body: JSON.stringify({
          leadId,
          name,
          stage: form.stage,
          value: form.value ? parseFloat(form.value.replace(/[^0-9.]/g, '')) : undefined,
          probability: form.score ? parseInt(form.score) : undefined,
        }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal title={t('modal.newOpportunity')} onClose={onClose} onSubmit={handleSubmit} submitText={saving ? t('common.saving') : t('modal.createOpportunity')} size="sm">
      {error && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>}

      <div>
        <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 500 }}>{t('modal.lead')}</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => switchMode('new')}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              background: leadMode === 'new' ? 'linear-gradient(90deg,#4f46e5,#7c3aed)' : 'transparent',
              color: leadMode === 'new' ? '#fff' : '#94a3b8',
              border: leadMode === 'new' ? 'none' : '1px solid #1e2433',
            }}
          >
            {t('modal.newLead')}
          </button>
          <button
            type="button"
            onClick={() => switchMode('existing')}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              background: leadMode === 'existing' ? 'linear-gradient(90deg,#4f46e5,#7c3aed)' : 'transparent',
              color: leadMode === 'existing' ? '#fff' : '#94a3b8',
              border: leadMode === 'existing' ? 'none' : '1px solid #1e2433',
            }}
          >
            {t('modal.existingLead')}
          </button>
        </div>

        {leadMode === 'existing' && (
          <div style={{ marginBottom: 4 }}>
            <input
              value={leadSearch}
              onChange={e => { setLeadSearch(e.target.value); setSelectedLead(null) }}
              placeholder={t('modal.searchLead')}
              style={{
                width: '100%', boxSizing: 'border-box', background: '#080c14', border: '1px solid #1e2433',
                borderRadius: 8, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }}
            />
            {searchingLeads && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#6b7280' }}>{t('common.search')}…</p>}
            {!selectedLead && leadResults.length > 0 && (
              <div style={{ marginTop: 6, border: '1px solid #1e2433', borderRadius: 8, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' }}>
                {leadResults.map(lead => (
                  <button
                    type="button"
                    key={lead.id}
                    onClick={() => pickLead(lead)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', background: '#0d1117', border: 'none',
                      borderBottom: '1px solid #1e2433', padding: '8px 10px', cursor: 'pointer', color: '#e2e8f0', fontSize: 12.5,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{lead.name || 'Sin nombre'}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{[lead.phone, lead.email].filter(Boolean).join(' · ') || '—'}</div>
                  </button>
                ))}
              </div>
            )}
            {selectedLead && (
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#10b981' }}>{t('modal.selectedLead')}: {selectedLead.name || selectedLead.id}</p>
            )}
          </div>
        )}
      </div>

      <FormInput
        label={leadMode === 'existing' ? (t('modal.opportunityNameOptional')) : t('modal.company')}
        value={form.company}
        onChange={e => update('company', e.target.value)}
        placeholder="Ej. DataPro Iberia"
        required={leadMode === 'new'}
      />
      <FormSelect
        label={t('modal.stage')}
        value={form.stage}
        onChange={e => update('stage', e.target.value)}
        options={ETAPAS.map((v, i) => ({ value: v, label: ETAPAS_LABEL[i] }))}
        required
      />
      <FormRow>
        <FormInput label={t('modal.estimatedValue')} value={form.value} onChange={e => update('value', e.target.value)} placeholder="0" />
        <FormInput label={t('modal.probability')} type="number" min="0" max="100" value={form.score} onChange={e => update('score', e.target.value)} placeholder="50" />
      </FormRow>
    </FormModal>
  )
}

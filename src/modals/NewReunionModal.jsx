import { useState, useEffect, useRef } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'
import FormToggle from '../components/forms/FormToggle'
import { apiFetch } from '../lib/api'
import { RiSearchLine, RiUserLine } from 'react-icons/ri'
import { useI18n } from '../i18n'

const DURACIONES = ['15 min', '30 min', '45 min', '60 min']
const DUR_MAP = { '15 min': 15, '30 min': 30, '45 min': 45, '60 min': 60 }
const DUR_MAP_REV = { 15: '15 min', 30: '30 min', 45: '45 min', 60: '60 min' }

function splitDateTime(iso) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function toggleBtnStyle(active) {
  return {
    flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--violet)' : 'var(--line)'}`,
    background: active ? '#8b5cf620' : 'transparent',
    color: active ? 'var(--violet-soft)' : 'var(--muted)',
  }
}

/**
 * RE-101: al crear, permite elegir entre dar de alta un lead nuevo (flujo
 * previo) o reutilizar uno ya existente (búsqueda server-side vía
 * GET /api/leads?search=...) para no duplicar leads cada vez que se agenda
 * una reunión.
 *
 * RE-102: si se pasa `meeting`, el modal cambia a modo "reprogramar" —
 * precarga fecha/hora/duración/objetivo de la reunión recibida y, al
 * confirmar, llama a POST /api/meetings/:id/reschedule en vez de crear una
 * reunión nueva (así no se pierde la referencia a la reunión original).
 */
export default function NewReunionModal({ onClose, onSuccess, meeting }) {
  const { t, locale } = useI18n()
  const isReschedule = !!meeting
  const initial = isReschedule ? splitDateTime(meeting.scheduledAt) : { date: '', time: '' }

  const [form, setForm] = useState({
    lead: '', company: '',
    date: initial.date, time: initial.time,
    duration: isReschedule ? (DUR_MAP_REV[meeting.durationMinutes] ?? '30 min') : '30 min',
    objective: isReschedule ? (meeting.objetivo || meeting.title || '') : '',
    reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [useExisting, setUseExisting] = useState(false)
  const [leadQuery, setLeadQuery] = useState('')
  const [debouncedLeadQuery, setDebouncedLeadQuery] = useState('')
  const [leadResults, setLeadResults] = useState([])
  const [searchingLeads, setSearchingLeads] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false)
  const boxRef = useRef(null)

  // Búsqueda de leads con debounce (300ms), mismo patrón que LE-101 en Leads.jsx.
  useEffect(() => {
    if (isReschedule) return
    const timeout = setTimeout(() => setDebouncedLeadQuery(leadQuery.trim()), 300)
    return () => clearTimeout(timeout)
  }, [leadQuery, isReschedule])

  useEffect(() => {
    if (isReschedule || !useExisting || !debouncedLeadQuery) { setLeadResults([]); return }
    let active = true
    setSearchingLeads(true)
    apiFetch(`/api/leads?search=${encodeURIComponent(debouncedLeadQuery)}&limit=8`)
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!active) return
        const items = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
        setLeadResults(items)
      })
      .catch(() => { if (active) setLeadResults([]) })
      .finally(() => { if (active) setSearchingLeads(false) })
    return () => { active = false }
  }, [debouncedLeadQuery, useExisting, isReschedule])

  useEffect(() => {
    if (isReschedule) return
    function onDocClick(event) { if (boxRef.current && !boxRef.current.contains(event.target)) setLeadDropdownOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [isReschedule])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      if (isReschedule) {
        if (!form.date || !form.time) { setError(t('modal.dateTimeRequired')); return }
        const scheduledAt = `${form.date}T${form.time}:00`
        const res = await apiFetch(`/api/meetings/${meeting.id}/reschedule`, {
          method: 'POST',
          body: JSON.stringify({ scheduledAt, reason: form.reason || undefined }),
        })
        if (!res.ok) { setError(t('modal.createError')); return }
        const item = await res.json()
        onSuccess ? onSuccess(item) : onClose()
        return
      }

      let leadId
      if (useExisting) {
        if (!selectedLead) { setError(t('modal.selectExistingLead')); return }
        leadId = selectedLead.id
      } else {
        if (!form.lead) { setError(t('modal.fullName')); return }
        const leadRes = await apiFetch('/api/leads', {
          method: 'POST',
          body: JSON.stringify({ name: form.lead, company: form.company || undefined }),
        })
        if (!leadRes.ok) { setError(t('modal.createError')); return }
        const lead = await leadRes.json()
        leadId = lead.id
      }

      const scheduledAt = form.date && form.time ? `${form.date}T${form.time}:00` : new Date().toISOString()
      const res = await apiFetch('/api/meetings', {
        method: 'POST',
        body: JSON.stringify({
          leadId,
          title: form.objective || `Reunión con ${useExisting ? (selectedLead?.name ?? '') : form.lead}`,
          scheduledAt,
          durationMinutes: DUR_MAP[form.duration] ?? 30,
          notes: form.objective || undefined,
        }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  return (
    <FormModal
      title={isReschedule ? t('modal.rescheduleMeeting') : t('modal.newMeeting')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitText={saving ? t('common.saving') : (isReschedule ? t('modal.confirmNewDate') : t('modal.createMeeting'))}
    >
      {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}

      {isReschedule ? (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{t('modal.newMeeting')}</span>
          <strong style={{ fontSize: 13, color: 'var(--text)' }}>{meeting.objetivo || meeting.title || 'Reunión'}</strong>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{meeting.lead?.name}{meeting.lead?.company ? ` · ${meeting.lead.company}` : ''}</span>
        </div>
      ) : (
        <div>
          <FormToggle label={t('modal.existingLead')} checked={useExisting} onChange={value => { setUseExisting(value); setSelectedLead(null); setLeadQuery('') }} />

          {useExisting ? (
            <div ref={boxRef} style={{ position: 'relative', marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'var(--dim)', marginBottom: 5, fontWeight: 500 }}>
                {t('modal.searchLead')}<span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <RiSearchLine style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--dim)' }} />
                <input
                  value={selectedLead ? selectedLead.name : leadQuery}
                  onChange={event => { setSelectedLead(null); setLeadQuery(event.target.value); setLeadDropdownOpen(true) }}
                  onFocus={() => setLeadDropdownOpen(true)}
                  placeholder={t('modal.searchLead')}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px 9px 30px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>
              {leadDropdownOpen && (leadResults.length > 0 || searchingLeads) && (
                <div style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-2)' }}>
                  {searchingLeads && <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--dim)' }}>{t('common.search')}…</div>}
                  {!searchingLeads && leadResults.map(lead => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => { setSelectedLead(lead); setLeadDropdownOpen(false) }}
                      style={{ display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
                      onMouseEnter={event => (event.currentTarget.style.background = 'var(--surface-hover)')}
                      onMouseLeave={event => (event.currentTarget.style.background = 'none')}
                    >
                      <strong style={{ fontSize: 12.5 }}>{lead.name}</strong>
                      <span style={{ fontSize: 11, color: 'var(--dim)' }}>{lead.company || t('modal.company')}</span>
                    </button>
                  ))}
                  {!searchingLeads && !leadResults.length && debouncedLeadQuery && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--dim)' }}>{t('common.noResults')}: "{debouncedLeadQuery}"</div>
                  )}
                </div>
              )}
              {selectedLead && (
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RiUserLine style={{ width: 12, height: 12 }} /> {t('modal.selectedLead')}: {selectedLead.name}
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
              <FormInput label={t('modal.fullName')} value={form.lead} onChange={e => update('lead', e.target.value)} placeholder={locale === 'en' ? 'e.g. Maria Rodriguez' : 'Ej. María Rodríguez'} required />
              <FormInput label={t('modal.company')} value={form.company} onChange={e => update('company', e.target.value)} placeholder={locale === 'en' ? 'e.g. TechSolutions Ltd.' : 'Ej. TechSolutions S.L.'} />
            </div>
          )}
        </div>
      )}

      <FormRow>
        <FormInput label={t('modal.date')} type="date" value={form.date} onChange={e => update('date', e.target.value)} required />
        <FormInput label={t('modal.time')} type="time" value={form.time} onChange={e => update('time', e.target.value)} required />
      </FormRow>
      <FormSelect label={t('modal.duration')} value={form.duration} onChange={e => update('duration', e.target.value)} options={DURACIONES} />
      {!isReschedule && <FormTextarea label={t('modal.meetingObjective')} value={form.objective} onChange={e => update('objective', e.target.value)} placeholder={locale === 'en' ? 'What do we want to achieve on this call?' : '¿Qué queremos conseguir en esta llamada?'} />}
      {isReschedule && <FormTextarea label={t('modal.changeReason')} value={form.reason} onChange={e => update('reason', e.target.value)} placeholder={locale === 'en' ? 'e.g. The customer asked to move the meeting' : 'Ej. El cliente pidió mover la reunión'} />}
    </FormModal>
  )
}

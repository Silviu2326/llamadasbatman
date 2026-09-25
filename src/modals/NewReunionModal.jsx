import { useState, useEffect, useRef } from 'react'
import FormModal from '../components/ui/FormModal'
import FormInput from '../components/forms/FormInput'
import FormTextarea from '../components/forms/FormTextarea'
import FormRow from '../components/forms/FormRow'
import { apiFetch } from '../lib/api'
import { RiArrowLeftLine, RiArrowRightLine, RiCalendarLine, RiCheckLine, RiLinkM, RiSearchLine, RiTimeLine, RiUserLine } from 'react-icons/ri'
import { useI18n } from '../i18n'
import './new-reunion-modal.css'

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
export default function NewReunionModal({ onClose, onSuccess, meeting, initialLead }) {
  const { t } = useI18n()
  const isReschedule = !!meeting
  const initial = isReschedule ? splitDateTime(meeting.scheduledAt) : { date: '', time: '' }

  const [form, setForm] = useState({
    lead: '', company: '',
    date: initial.date, time: initial.time,
    duration: isReschedule ? (DUR_MAP_REV[meeting.durationMinutes] ?? '30 min') : '30 min',
    objective: isReschedule ? (meeting.objetivo || meeting.title || '') : '',
    meetingUrl: '',
    reason: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState(0)

  const [useExisting, setUseExisting] = useState(Boolean(initialLead))
  const [leadQuery, setLeadQuery] = useState('')
  const [debouncedLeadQuery, setDebouncedLeadQuery] = useState('')
  const [leadResults, setLeadResults] = useState([])
  const [searchingLeads, setSearchingLeads] = useState(false)
  const [selectedLead, setSelectedLead] = useState(initialLead || null)
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

  useEffect(() => {
    const frame = requestAnimationFrame(() => document.querySelector('.new-meeting-wizard [data-autofocus]')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [step])

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSubmit() {
    if (saving) return
    if (!form.date || !form.time) { setError(t('modal.dateTimeRequired')); return }
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
          meetingUrl: form.meetingUrl.trim() || undefined,
          notes: form.objective || undefined,
        }),
      })
      if (!res.ok) { setError(t('modal.createError')); return }
      const item = await res.json()
      onSuccess ? onSuccess(item) : onClose()
    } catch { setError(t('modal.connectionError')) } finally { setSaving(false) }
  }

  const steps = isReschedule
    ? [
        { title: 'Nueva fecha', description: 'Elige el nuevo momento de la reunión.', icon: RiCalendarLine },
        { title: 'Motivo', description: 'Deja contexto para el cambio.', icon: RiTimeLine },
        { title: 'Confirmar', description: 'Comprueba todo antes de reprogramar.', icon: RiCheckLine },
      ]
    : [
        { title: 'Persona', description: 'Indica con quién te vas a reunir.', icon: RiUserLine },
        { title: 'Fecha y hora', description: 'Reserva el momento adecuado.', icon: RiCalendarLine },
        { title: 'Detalles', description: 'Añade el objetivo y el enlace.', icon: RiLinkM },
        { title: 'Revisar', description: 'Comprueba la invitación antes de crearla.', icon: RiCheckLine },
      ]

  function validateStep() {
    setError(null)
    if (!isReschedule && step === 0) {
      if (useExisting && !selectedLead) { setError(t('modal.selectExistingLead')); return false }
      if (!useExisting && !form.lead.trim()) { setError('Escribe el nombre de la persona para continuar.'); return false }
    }
    if ((isReschedule ? step === 0 : step === 1) && (!form.date || !form.time)) {
      setError(t('modal.dateTimeRequired'))
      return false
    }
    return true
  }

  function nextStep() {
    if (!validateStep()) return
    setStep(current => Math.min(steps.length - 1, current + 1))
  }

  function previousStep() {
    setError(null)
    setStep(current => Math.max(0, current - 1))
  }

  function handleFormSubmit() {
    if (step < steps.length - 1) nextStep()
    else handleSubmit()
  }

  const personName = useExisting ? selectedLead?.name : form.lead
  const personCompany = useExisting ? selectedLead?.company : form.company
  const scheduledLabel = form.date && form.time
    ? new Date(`${form.date}T${form.time}:00`).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : 'Sin fecha seleccionada'

  const footer = <div className="new-meeting-footer">
    <button type="button" className="new-meeting-back" disabled={saving} onClick={step === 0 ? onClose : previousStep}>{step === 0 ? t('common.cancel') : <><RiArrowLeftLine /> Atrás</>}</button>
    <span>{step + 1} de {steps.length}</span>
    <button type="button" className="new-meeting-next" disabled={saving} onClick={step === steps.length - 1 ? handleSubmit : nextStep}>{step === steps.length - 1 ? <><RiCheckLine /> {saving ? t('common.saving') : (isReschedule ? t('modal.confirmNewDate') : t('modal.createMeeting'))}</> : <>Continuar <RiArrowRightLine /></>}</button>
  </div>
  const StepIcon = steps[step].icon

  return (
    <FormModal
      title={isReschedule ? t('modal.rescheduleMeeting') : t('modal.newMeeting')}
      onClose={() => { if (!saving) onClose() }}
      onSubmit={handleFormSubmit}
      submitDisabled={saving}
      size="lg"
      footer={footer}
      className="new-meeting-wizard"
    >
      <div className="new-meeting-progress" aria-label={`Paso ${step + 1} de ${steps.length}`}>
        <div className="new-meeting-progress-copy"><span className="new-meeting-step-icon"><StepIcon /></span><div><small>Paso {step + 1} de {steps.length}</small><h4>{steps[step].title}</h4><p>{steps[step].description}</p></div></div>
        <div className="new-meeting-dots" aria-hidden="true">{steps.map((item, index) => <i key={item.title} className={index === step ? 'current' : index < step ? 'done' : ''} />)}</div>
        <div className="new-meeting-progress-track"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      </div>

      {error ? <p className="new-meeting-error" role="alert">{error}</p> : null}

      <div className="new-meeting-step" key={step}>
        {!isReschedule && step === 0 ? <>
          <div className="new-meeting-question"><span>1</span><div><h3>¿Con quién es la reunión?</h3><p>Puedes crear un contacto ahora o elegir uno que ya exista en tu CRM.</p></div></div>
          <div className="new-meeting-contact-type">
            <button type="button" aria-pressed={!useExisting} className={!useExisting ? 'active' : ''} onClick={() => { setUseExisting(false); setSelectedLead(null); setLeadQuery(''); setError(null) }}><RiUserLine /><span><strong>Contacto nuevo</strong><small>Añadirlo al CRM al crear la reunión</small></span></button>
            <button type="button" aria-pressed={useExisting} className={useExisting ? 'active' : ''} onClick={() => { setUseExisting(true); setSelectedLead(null); setLeadQuery(''); setError(null) }}><RiSearchLine /><span><strong>Contacto existente</strong><small>Buscar en tus contactos actuales</small></span></button>
          </div>
          {useExisting ? <div className="new-meeting-lead-search" ref={boxRef}>
            <RiSearchLine /><input data-autofocus value={selectedLead ? selectedLead.name : leadQuery} onChange={event => { setSelectedLead(null); setLeadQuery(event.target.value); setLeadDropdownOpen(true) }} onFocus={() => setLeadDropdownOpen(true)} placeholder="Busca por nombre o empresa…" aria-label={t('modal.searchLead')} />
            {leadDropdownOpen && (leadResults.length > 0 || searchingLeads || debouncedLeadQuery) ? <div className="new-meeting-lead-results">{searchingLeads ? <p>{t('common.search')}…</p> : leadResults.length ? leadResults.map(lead => <button key={lead.id} type="button" onClick={() => { setSelectedLead(lead); setLeadDropdownOpen(false) }}><strong>{lead.name}</strong><span>{lead.company || 'Sin empresa'}</span></button>) : <p>{t('common.noResults')}: “{debouncedLeadQuery}”</p>}</div> : null}
            {selectedLead ? <p className="new-meeting-selected"><RiCheckLine /> {selectedLead.name}{selectedLead.company ? ` · ${selectedLead.company}` : ''}</p> : null}
          </div> : <div className="new-meeting-fields"><FormInput label="Nombre completo" value={form.lead} onChange={event => update('lead', event.target.value)} placeholder="Ej. María Rodríguez" required data-autofocus /><FormInput label="Empresa" value={form.company} onChange={event => update('company', event.target.value)} placeholder="Ej. TechSolutions S.L." /></div>}
        </> : null}

        {((!isReschedule && step === 1) || (isReschedule && step === 0)) ? <>
          <div className="new-meeting-question"><span>{isReschedule ? 1 : 2}</span><div><h3>¿Cuándo será?</h3><p>Selecciona fecha, hora y cuánto tiempo quieres reservar.</p></div></div>
          {isReschedule ? <div className="new-meeting-context"><small>Reprogramando</small><strong>{meeting.objetivo || meeting.title || 'Reunión'}</strong><span>{meeting.lead?.name}{meeting.lead?.company ? ` · ${meeting.lead.company}` : ''}</span></div> : null}
          <FormRow><FormInput label={t('modal.date')} type="date" value={form.date} onChange={event => update('date', event.target.value)} required data-autofocus /><FormInput label={t('modal.time')} type="time" value={form.time} onChange={event => update('time', event.target.value)} required /></FormRow>
          {!isReschedule ? <div className="new-meeting-duration"><label>Duración</label><div>{DURACIONES.map(duration => <button type="button" key={duration} className={form.duration === duration ? 'active' : ''} onClick={() => update('duration', duration)}>{duration}</button>)}</div></div> : null}
        </> : null}

        {((!isReschedule && step === 2) || (isReschedule && step === 1)) ? <>
          <div className="new-meeting-question"><span>{isReschedule ? 2 : 3}</span><div><h3>{isReschedule ? '¿Por qué cambia la fecha?' : '¿Qué vais a tratar?'}</h3><p>{isReschedule ? 'Añade una nota breve para conservar el contexto.' : 'El objetivo ayuda a que todos lleguen preparados.'}</p></div></div>
          {isReschedule ? <FormTextarea label={t('modal.changeReason')} value={form.reason} onChange={event => update('reason', event.target.value)} placeholder="Ej. El cliente pidió mover la reunión" rows={4} data-autofocus /> : <><FormTextarea label={t('modal.meetingObjective')} value={form.objective} onChange={event => update('objective', event.target.value)} placeholder="Ej. Revisar necesidades y acordar los siguientes pasos" rows={4} data-autofocus /><FormInput label="Enlace de la reunión" type="url" value={form.meetingUrl} onChange={event => update('meetingUrl', event.target.value)} placeholder="https://meet.google.com/abc-defg-hij" hint="Opcional. Puedes añadir Google Meet, Zoom o cualquier otra sala." /></>}
        </> : null}

        {step === steps.length - 1 ? <>
          <div className="new-meeting-question"><span><RiCheckLine /></span><div><h3>{isReschedule ? 'Confirma la nueva fecha' : 'Todo listo para agendar'}</h3><p>Revisa los datos antes de guardar la reunión.</p></div></div>
          <div className="new-meeting-review">
            <button type="button" onClick={() => setStep(0)}><span><RiUserLine /> Persona</span><strong>{isReschedule ? (meeting.lead?.name || 'Sin contacto') : (personName || 'Sin nombre')}</strong><small>{isReschedule ? meeting.lead?.company : (personCompany || 'Sin empresa')}</small></button>
            <button type="button" onClick={() => setStep(isReschedule ? 0 : 1)}><span><RiCalendarLine /> Fecha y hora</span><strong>{scheduledLabel}</strong><small>{isReschedule ? 'Nueva fecha propuesta' : form.duration}</small></button>
            <button type="button" onClick={() => setStep(isReschedule ? 1 : 2)}><span><RiLinkM /> {isReschedule ? 'Motivo' : 'Detalles'}</span><strong>{isReschedule ? (form.reason || 'Sin motivo añadido') : (form.objective || 'Sin objetivo añadido')}</strong><small>{!isReschedule && form.meetingUrl ? form.meetingUrl : 'Sin enlace de videollamada'}</small></button>
          </div>
          <p className="new-meeting-ready"><RiCheckLine /> {isReschedule ? 'La reunión conservará su historial y contacto.' : 'El contacto y la reunión se guardarán juntos en el CRM.'}</p>
        </> : null}
      </div>
    </FormModal>
  )
}

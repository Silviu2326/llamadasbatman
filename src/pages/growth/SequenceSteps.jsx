import { useEffect, useState } from 'react'
import { RiAddLine, RiDeleteBinLine, RiPlayCircleLine, RiTimeLine, RiStopCircleLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'

/**
 * El motor de secuencias (backend/src/services/salesSequence.service.ts) ya
 * ejecutaba pasos, reintentos y compliance, pero no había forma de definirlos:
 * el formulario solo mandaba nombre y tipo, así que toda secuencia creada desde
 * la interfaz nacía sin pasos y fallaba al matricular con SEQUENCE_STEPS_INVALID.
 */
export const STEP_TYPES = [
  { value: 'task', label: 'Tarea interna', needs: 'title' },
  { value: 'call', label: 'Llamada', needs: 'title' },
  { value: 'meeting', label: 'Reunión', needs: 'title' },
  { value: 'email', label: 'Email (plantilla)', needs: 'template' },
  { value: 'ai_email', label: 'Email escrito por IA', needs: null },
  { value: 'whatsapp', label: 'WhatsApp (plantilla)', needs: 'template' },
]

export function emptyStep(index) {
  return { key: `step-${index + 1}`, type: 'task', delayDays: index === 0 ? 0 : 2, title: '', templateExternalId: '', purpose: '' }
}

/** Editor de los pasos que se guardan en `program.config.steps`. */
export function SequenceStepsEditor({ steps, onChange }) {
  const update = (index, field, value) => onChange(steps.map((step, i) => (i === index ? { ...step, [field]: value } : step)))
  const remove = index => onChange(steps.filter((_, i) => i !== index))
  const add = () => onChange([...steps, emptyStep(steps.length)])

  return (
    <div className="growth-field wide">
      <span>Pasos de la secuencia</span>
      {steps.length === 0 && <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--dim)' }}>Una secuencia necesita al menos un paso para poder matricular leads.</p>}
      {steps.map((step, index) => {
        const meta = STEP_TYPES.find(option => option.value === step.type)
        return (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8, alignItems: 'end', marginBottom: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <select value={step.type} onChange={event => update(index, 'type', event.target.value)}>
                {STEP_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {meta?.needs === 'title' && (
                <input value={step.title} maxLength={160} onChange={event => update(index, 'title', event.target.value)} placeholder="Título (obligatorio)" />
              )}
              {meta?.needs === 'template' && (
                <input value={step.templateExternalId} maxLength={160} onChange={event => update(index, 'templateExternalId', event.target.value)} placeholder={step.type === 'whatsapp' ? 'contentSid de la plantilla aprobada' : 'ID de plantilla en Mautic'} />
              )}
              {meta?.needs === null && (
                <input value={step.purpose} maxLength={160} onChange={event => update(index, 'purpose', event.target.value)} placeholder="Propósito del email (opcional)" />
              )}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input type="number" min="0" max="365" value={step.delayDays} onChange={event => update(index, 'delayDays', Number(event.target.value))} aria-label={`Días de espera del paso ${index + 1}`} />
              <small style={{ fontSize: 10.5, color: 'var(--dim)' }}>días de espera</small>
            </label>
            <button type="button" className="growth-icon-button" onClick={() => remove(index)} aria-label={`Quitar paso ${index + 1}`}><RiDeleteBinLine /></button>
          </div>
        )
      })}
      <button type="button" className="growth-small-button" onClick={add}><RiAddLine /> <span>Añadir paso</span></button>
    </div>
  )
}

/** Matricula leads y gobierna la secuencia contra las rutas que ya existían. */
export function SequenceEnrollPanel({ program }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const loadEnrollments = () => apiFetch(`/api/growth-programs/${program.id}/enrollments`)
    .then(response => (response.ok ? response.json() : []))
    .then(rows => setEnrollments(Array.isArray(rows) ? rows : rows?.data ?? []))
    .catch(() => {})

  useEffect(() => { loadEnrollments() }, [program.id])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(() => {
      apiFetch(`/api/leads?search=${encodeURIComponent(query.trim())}&limit=8`)
        .then(response => (response.ok ? response.json() : null))
        .then(payload => setResults(payload?.data ?? []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  async function action(path, body) {
    setBusy(true)
    setMessage(null)
    try {
      const response = await apiFetch(`/api/growth-programs/${program.id}/${path}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage(payload?.error || payload?.message || 'No se pudo completar la acción.')
        return
      }
      setSelected([])
      setQuery('')
      await loadEnrollments()
      setMessage(null)
    } catch {
      setMessage('No se pudo conectar con el servidor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" className="growth-small-button" disabled={busy} onClick={() => action('pause')}><RiTimeLine /> <span>Pausar</span></button>
        <button type="button" className="growth-small-button" disabled={busy} onClick={() => action('resume')}><RiPlayCircleLine /> <span>Reanudar</span></button>
        <button type="button" className="growth-small-button" disabled={busy} onClick={() => action('stop', { reason: 'manual' })}><RiStopCircleLine /> <span>Detener</span></button>
        <span>{enrollments.length} matriculados</span>
      </div>

      <input
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Buscar leads por nombre o email para matricular…"
        style={{ width: '100%', marginBottom: 6 }}
      />
      {results.map(lead => {
        const checked = selected.includes(lead.id)
        return (
          <label key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5 }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => setSelected(current => (checked ? current.filter(id => id !== lead.id) : [...current, lead.id]))}
            />
            <span>{lead.name}{lead.email ? ` · ${lead.email}` : ''}</span>
          </label>
        )
      })}
      {selected.length > 0 && (
        <button type="button" className="growth-button primary" disabled={busy} onClick={() => action('enroll', { leadIds: selected })} style={{ marginTop: 8 }}>
          {busy ? 'Matriculando…' : `Matricular ${selected.length} lead${selected.length === 1 ? '' : 's'}`}
        </button>
      )}
      {message && <p className="growth-modal-error" role="alert" style={{ marginTop: 8 }}>{message}</p>}
    </div>
  )
}

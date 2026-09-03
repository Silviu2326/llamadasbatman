import React, { useEffect, useMemo, useState } from 'react'
import { RiArrowLeftLine, RiArrowRightLine, RiCheckLine, RiFileTextLine, RiMicLine, RiPhoneLine, RiPlayLine, RiRobot2Line, RiRocket2Line, RiShieldCheckLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import './agent-simple-setup.css'

const AGENT_TYPES = [['sales', 'Ventas'], ['receptionist', 'Recepción'], ['qualification', 'Cualificación'], ['appointment', 'Citas'], ['support', 'Soporte'], ['collections', 'Cobros'], ['handoff', 'Transferencias']]

export default function AgentSimpleSetup({ agentId, draft, onChange, onSave, saving, saved, onNavigate, onPublished }) {
  const [workspace, setWorkspace] = useState(null)
  const [step, setStep] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consent, setConsent] = useState({ subjectName: '', subjectContact: '', evidenceAssetId: '', expiresAt: '', confirmed: false })
  const [message, setMessage] = useState('')

  const load = async () => {
    const response = await apiFetch(`/api/agents/${agentId}/workspace`)
    if (response.ok) setWorkspace(await response.json())
  }
  useEffect(() => { load() }, [agentId])

  const completion = useMemo(() => [
    Boolean(draft.name?.trim() && draft.role?.trim() && draft.agentType),
    Boolean(draft.voiceId?.trim() && workspace?.activeConsent),
    Boolean(draft.systemPrompt?.trim()),
    /^\+[1-9]\d{7,14}$/.test(draft.phoneNumber || ''),
    Boolean(workspace?.latestEvaluation?.overall >= 75),
    Boolean(workspace?.readiness?.ready),
  ], [draft.name, draft.role, draft.agentType, draft.voiceId, draft.systemPrompt, draft.phoneNumber, workspace])

  const steps = [
    { title: 'Identidad', detail: 'Quién es y qué función cumple', Icon: RiRobot2Line },
    { title: 'Voz', detail: 'Cómo escucharán al agente', Icon: RiMicLine },
    { title: 'Instrucciones', detail: 'Qué debe hacer en cada llamada', Icon: RiFileTextLine },
    { title: 'Número', detail: 'Desde qué teléfono llamará', Icon: RiPhoneLine },
    { title: 'Prueba real', detail: 'Comprueba que funciona bien', Icon: RiPlayLine },
    { title: 'Publicar', detail: 'Déjalo listo para trabajar', Icon: RiRocket2Line },
  ]

  const saveAndContinue = async () => {
    setMessage('')
    const ok = await onSave()
    if (!ok) return
    await load()
    setStep(current => Math.min(steps.length - 1, current + 1))
  }

  const publish = async () => {
    setPublishing(true); setMessage('')
    try {
      const savedOk = await onSave()
      if (!savedOk) return
      const response = await apiFetch(`/api/agents/${agentId}/publish`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.blockers?.map(item => item.label).join(', ') || body.error || 'Todavía faltan requisitos.')
      setMessage('El agente está publicado y listo para trabajar.')
      onPublished?.()
      await load()
    } catch (error) { setMessage(error.message) } finally { setPublishing(false) }
  }

  const createConsent = async () => {
    setConsentBusy(true); setMessage('')
    try {
      const savedOk = await onSave()
      if (!savedOk) return
      const response = await apiFetch(`/api/agents/${agentId}/consents`, { method: 'POST', body: JSON.stringify({ ...consent, evidenceAssetId: consent.evidenceAssetId || undefined, subjectContact: consent.subjectContact || undefined, expiresAt: consent.expiresAt ? new Date(`${consent.expiresAt}T23:59:59.000Z`).toISOString() : undefined }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo registrar la autorización.')
      setMessage('Autorización de voz registrada correctamente.')
      await load()
    } catch (error) { setMessage(error.message) } finally { setConsentBusy(false) }
  }

  const evaluateLatestCall = async () => {
    const call = workspace?.calls?.find(item => item.status === 'completed')
    if (!call) return onNavigate(`/voz/cabina?agentId=${encodeURIComponent(agentId)}`)
    setEvaluating(true); setMessage('')
    try {
      const response = await apiFetch(`/api/agents/${agentId}/evaluations/${call.id}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'No se pudo evaluar la llamada.')
      setMessage('La última llamada se ha evaluado correctamente.')
      await load()
    } catch (error) { setMessage(error.message) } finally { setEvaluating(false) }
  }

  const readyCount = completion.filter(Boolean).length
  const current = steps[step]

  return <section className="agent-simple" aria-labelledby="agent-simple-title">
    <header className="agent-simple-header">
      <div><h2 id="agent-simple-title">Prepara tu agente paso a paso</h2><p>Completa estos seis pasos. Puedes volver a cualquiera cuando quieras.</p></div>
      <div className="agent-simple-progress-copy"><strong>{readyCount} de 6</strong><span>completados</span></div>
    </header>
    <div className="agent-simple-progress" aria-hidden="true"><i style={{ width: `${readyCount / 6 * 100}%` }} /></div>

    <div className="agent-simple-shell">
      <nav className="agent-simple-steps" aria-label="Pasos de configuración">
        {steps.map(({ title, detail, Icon }, index) => <button type="button" key={title} className={`${step === index ? 'is-active' : ''} ${completion[index] ? 'is-done' : ''}`} onClick={() => setStep(index)} aria-current={step === index ? 'step' : undefined}><span className="agent-simple-step-number">{completion[index] ? <RiCheckLine /> : index + 1}</span><Icon className="agent-simple-step-icon" /><span><strong>{title}</strong><small>{detail}</small></span></button>)}
      </nav>

      <div className="agent-simple-panel">
        <div className="agent-simple-panel-heading"><current.Icon /><div><span>Paso {step + 1} de 6</span><h3>{current.title}</h3><p>{current.detail}</p></div></div>

        {step === 0 ? <div className="agent-simple-form is-two">
          <label><span>Nombre del agente</span><input value={draft.name || ''} onChange={event => onChange({ name: event.target.value })} placeholder="Ej. Laura" autoFocus /></label>
          <label><span>Su función</span><input value={draft.role || ''} onChange={event => onChange({ role: event.target.value })} placeholder="Ej. Asesora comercial" /></label>
          <label className="is-wide"><span>Tipo de agente</span><select value={draft.agentType || 'sales'} onChange={event => onChange({ agentType: event.target.value })}>{AGENT_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label className="is-wide"><span>Descripción breve</span><textarea value={draft.description || ''} onChange={event => onChange({ description: event.target.value })} placeholder="Explica de forma sencilla para qué utilizarás este agente." /></label>
        </div> : null}

        {step === 1 ? <div className="agent-simple-form">
          <label><span>Voz del agente</span><input value={draft.voiceId || ''} onChange={event => onChange({ voiceId: event.target.value })} placeholder="Introduce o pega la voz seleccionada" autoFocus /></label>
          <div className="agent-simple-help"><RiMicLine /><div><strong>¿Quieres escucharla?</strong><p>Guarda la voz y abre la cabina para comprobar cómo suena en una conversación.</p></div><button type="button" onClick={() => onNavigate(`/voz/cabina?agentId=${encodeURIComponent(agentId)}`)}>Abrir cabina</button></div>
          {workspace?.activeConsent ? <p className="agent-simple-consent-ok"><RiCheckLine /> Voz autorizada por {workspace.activeConsent.subjectName}{workspace.activeConsent.expiresAt ? ` hasta el ${new Date(workspace.activeConsent.expiresAt).toLocaleDateString()}` : ''}.</p> : <div className="agent-simple-consent-form"><div><RiShieldCheckLine /><span><strong>Autorización de la voz</strong><small>Necesaria si esta voz pertenece o imita a una persona.</small></span></div><label><span>Persona que autoriza</span><input value={consent.subjectName} onChange={event => setConsent(current => ({ ...current, subjectName: event.target.value }))} placeholder="Nombre completo" /></label><div className="agent-simple-consent-grid"><label><span>Contacto (opcional)</span><input value={consent.subjectContact} onChange={event => setConsent(current => ({ ...current, subjectContact: event.target.value }))} placeholder="Email o teléfono" /></label><label><span>Caducidad (opcional)</span><input type="date" value={consent.expiresAt} onChange={event => setConsent(current => ({ ...current, expiresAt: event.target.value }))} /></label></div><label><span>Documento guardado (opcional)</span><input value={consent.evidenceAssetId} onChange={event => setConsent(current => ({ ...current, evidenceAssetId: event.target.value }))} placeholder="Referencia del documento de autorización" /></label><label className="agent-simple-confirm"><input type="checkbox" checked={consent.confirmed} onChange={event => setConsent(current => ({ ...current, confirmed: event.target.checked }))} /><span>Confirmo que esta persona ha autorizado el uso de su voz para llamadas realizadas por este agente.</span></label><button type="button" disabled={!draft.voiceId?.trim() || !consent.subjectName.trim() || !consent.confirmed || consentBusy} onClick={createConsent}>{consentBusy ? 'Registrando…' : 'Registrar autorización'}</button></div>}
        </div> : null}

        {step === 2 ? <div className="agent-simple-form">
          <label><span>¿Qué debe hacer el agente?</span><textarea className="is-large" value={draft.systemPrompt || ''} onChange={event => onChange({ systemPrompt: event.target.value })} placeholder="Ej. Preséntate, pregunta qué necesita el cliente, explica cómo podemos ayudarle y trata de concertar una reunión. Nunca inventes información." autoFocus /></label>
          <p className="agent-simple-tip"><RiShieldCheckLine /> Escribe como si estuvieras explicándole el trabajo a una persona nueva.</p>
        </div> : null}

        {step === 3 ? <div className="agent-simple-form">
          <label><span>Número desde el que llamará</span><input value={draft.phoneNumber || ''} onChange={event => onChange({ phoneNumber: event.target.value })} placeholder="+34910000000" autoFocus /></label>
          <p className={`agent-simple-validation ${completion[3] ? 'is-valid' : ''}`}>{completion[3] ? <RiCheckLine /> : <RiPhoneLine />}{completion[3] ? 'El número tiene un formato válido.' : 'Incluye el prefijo del país, por ejemplo +34.'}</p>
        </div> : null}

        {step === 4 ? <div className="agent-simple-test">
          {workspace?.latestEvaluation ? <><div className="agent-simple-score"><strong>{workspace.latestEvaluation.overall}</strong><span>puntos sobre 100</span></div><div><h4>{workspace.latestEvaluation.overall >= 75 ? 'Prueba superada' : 'Conviene repetir la prueba'}</h4><p>La publicación requiere al menos 75 puntos y ningún incumplimiento grave.</p></div></> : <><div className="agent-simple-test-icon"><RiPlayLine /></div><div><h4>{workspace?.calls?.some(item => item.status === 'completed') ? 'Hay una llamada lista para evaluar' : 'Aún no hay una prueba válida'}</h4><p>{workspace?.calls?.some(item => item.status === 'completed') ? 'Pulsa evaluar y recibirás la nota sin salir de este modo.' : 'Realiza una llamada auténtica desde la cabina y vuelve a este paso.'}</p></div></>}
          <div className="agent-simple-test-actions"><button type="button" onClick={() => onNavigate(`/voz/cabina?agentId=${encodeURIComponent(agentId)}`)}>{workspace?.latestEvaluation ? 'Hacer otra prueba' : 'Abrir cabina'}</button>{workspace?.calls?.some(item => item.status === 'completed') ? <button type="button" className="is-primary" disabled={evaluating} onClick={evaluateLatestCall}>{evaluating ? 'Evaluando…' : 'Evaluar última llamada'}</button> : null}</div>
        </div> : null}

        {step === 5 ? <div className="agent-simple-publish">
          <div className="agent-simple-readiness">{workspace?.readiness?.checks?.map(item => <div key={item.key} className={item.ready ? 'is-ready' : ''}><span>{item.ready ? <RiCheckLine /> : '·'}</span><strong>{item.label}</strong><small>{item.ready ? 'Completado' : 'Pendiente'}</small></div>)}</div>
          <button className="agent-simple-publish-button" type="button" disabled={!workspace?.readiness?.ready || publishing} onClick={publish}><RiRocket2Line />{publishing ? 'Publicando…' : workspace?.readiness?.ready ? 'Publicar agente' : 'Completa los pasos pendientes'}</button>
        </div> : null}

        {message ? <p className="agent-simple-message" role="status">{message}</p> : null}
        <footer className="agent-simple-footer">
          <button type="button" className="agent-simple-back" disabled={step === 0} onClick={() => setStep(currentStep => currentStep - 1)}><RiArrowLeftLine />Anterior</button>
          {step < 5 ? <button type="button" className="agent-simple-next" disabled={saving} onClick={saveAndContinue}>{saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar y continuar'}<RiArrowRightLine /></button> : null}
        </footer>
      </div>
    </div>
  </section>
}

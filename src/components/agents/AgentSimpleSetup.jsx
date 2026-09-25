import React, { useEffect, useMemo, useRef, useState } from 'react'
import { RiArrowLeftLine, RiArrowRightLine, RiCheckLine, RiFileTextLine, RiMicLine, RiPhoneLine, RiPlayLine, RiRobot2Line, RiRocket2Line, RiShieldCheckLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import AgentVoicePicker from './AgentVoicePicker'
import { LIFECYCLE, lifecycleOf, apiErrorMessage, readBody } from './agentLifecycle'
import './agent-simple-setup.css'

const TEST_POLL_INTERVAL_MS = 5000
const TEST_POLL_MAX_MS = 3 * 60 * 1000

const AGENT_TYPES = [['sales', 'Ventas'], ['receptionist', 'Recepción'], ['qualification', 'Cualificación'], ['appointment', 'Citas'], ['support', 'Soporte'], ['collections', 'Cobros'], ['handoff', 'Transferencias']]

export default function AgentSimpleSetup({ agentId, draft, onChange, onSave, saving, saved, onNavigate, onPublished, onOpenGovernance, onWorkspaceLoaded }) {
  const [workspace, setWorkspace] = useState(null)
  const [testWatch, setTestWatch] = useState('')
  const pollTimer = useRef(null)
  const [step, setStep] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [testCalling, setTestCalling] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consent, setConsent] = useState({ subjectName: '', subjectContact: '', evidenceAssetId: '', expiresAt: '', confirmed: false })
  const [message, setMessage] = useState('')
  const [uploadedVoiceId, setUploadedVoiceId] = useState(null)

  const load = async () => {
    const response = await apiFetch(`/api/agents/${agentId}/workspace`)
    if (!response.ok) return null
    const next = await response.json()
    setWorkspace(next)
    onWorkspaceLoaded?.(next)
    return next
  }
  useEffect(() => { load() }, [agentId])
  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current) }, [])

  const check = key => workspace?.readiness?.checks?.find(item => item.key === key)
  const lifecycle = lifecycleOf(workspace?.agent)
  // Los pasos se dan por hechos con los mismos checks que aplica el servidor al publicar.
  const completion = useMemo(() => [
    Boolean(draft.name?.trim() && draft.role?.trim() && draft.agentType),
    Boolean(draft.voiceId?.trim() && check('consent')?.ready),
    Boolean(draft.systemPrompt?.trim()),
    /^\+[1-9]\d{7,14}$/.test(draft.phoneNumber || '') && (check('outboundNumber')?.ready ?? true),
    Boolean(check('test')?.ready),
    lifecycle === 'active',
  ], [draft.name, draft.role, draft.agentType, draft.voiceId, draft.systemPrompt, draft.phoneNumber, workspace]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const body = await readBody(response)
      if (!response.ok) throw new Error(apiErrorMessage(body, 'Todavía faltan requisitos.'))
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
      const body = await readBody(response)
      if (!response.ok) throw new Error(apiErrorMessage(body, 'No se pudo registrar la autorización.'))
      setMessage('Autorización de voz registrada correctamente.')
      await load()
    } catch (error) { setMessage(error.message) } finally { setConsentBusy(false) }
  }

  // La cabina del navegador no crea una llamada en el CRM, así que no sirve
  // como prueba real. La prueba de verdad marca un número propio autorizado
  // (voiceTestCall.service.ts) y se evalúa sola al colgar.
  const watchTestCall = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    const startedAt = Date.now()
    const known = new Set((workspace?.calls || []).map(item => item.id))
    setTestWatch('Marcando… descuelga en tu número de prueba.')
    const tick = async () => {
      const refreshed = await load().catch(() => null)
      const fresh = refreshed?.calls?.find(item => item.isTest && !known.has(item.id)) || null
      if (fresh?.evaluation?.status === 'completed') {
        const test = refreshed.readiness?.checks?.find(item => item.key === 'test')
        setTestWatch('')
        setMessage(`Prueba evaluada: ${fresh.evaluation.overall}/100. ${test?.ready ? 'Ya puedes publicar.' : test?.detail || ''}`)
        return
      }
      if (Date.now() - startedAt >= TEST_POLL_MAX_MS) {
        setTestWatch('')
        setMessage(fresh ? 'La llamada terminó pero la evaluación aún no ha llegado. Usa «Evaluar última llamada».' : 'No se registró la llamada en 3 minutos. Si no sonó, revisa el número y vuelve a intentarlo.')
        return
      }
      setTestWatch(fresh ? (fresh.status === 'completed' ? 'Llamada terminada: evaluando…' : 'Llamada en curso. Al colgar se evaluará sola.') : 'Marcando… descuelga en tu número de prueba.')
      pollTimer.current = setTimeout(tick, TEST_POLL_INTERVAL_MS)
    }
    pollTimer.current = setTimeout(tick, TEST_POLL_INTERVAL_MS)
  }

  const startTestCall = async () => {
    const number = workspace?.testCall?.numbers?.find(item => item.active)
    if (!number) return
    setTestCalling(true); setMessage('')
    try {
      const response = await apiFetch(`/api/agents/${agentId}/test-calls`, { method: 'POST', body: JSON.stringify({ testNumberId: number.id }) })
      const body = await readBody(response)
      if (!response.ok) throw new Error(apiErrorMessage(body, 'No se pudo lanzar la llamada de prueba.'))
      setMessage(`Llamando a ${body.to}. La nota aparecerá aquí sola cuando cuelgues.`)
      watchTestCall()
    } catch (error) { setMessage(error.message) } finally { setTestCalling(false) }
  }

  const evaluateLatestCall = async () => {
    const call = workspace?.calls?.find(item => item.status === 'completed')
    if (!call) return
    setEvaluating(true); setMessage('')
    try {
      const response = await apiFetch(`/api/agents/${agentId}/evaluations/${call.id}`, { method: 'POST' })
      const body = await readBody(response)
      if (!response.ok) throw new Error(apiErrorMessage(body, 'No se pudo evaluar la llamada.'))
      setMessage('La última llamada se ha evaluado correctamente.')
      await load()
    } catch (error) { setMessage(error.message) } finally { setEvaluating(false) }
  }

  const readyCount = completion.filter(Boolean).length
  const current = steps[step]
  const testNumber = workspace?.testCall?.numbers?.find(item => item.active) || null

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
          <AgentVoicePicker agentId={agentId} onVoiceCreated={setUploadedVoiceId} value={draft.voiceId || ''} selection={draft.settings?.voiceSelection} language={draft.language} onChange={(voiceId, name) => onChange({ voiceId, settings: { ...draft.settings, voiceSelection: { id: voiceId, name } } })} />
          <div className="agent-simple-help"><RiMicLine /><div><strong>¿Quieres escucharla?</strong><p>Guarda la voz y abre la cabina del navegador para oír cómo suena. Es solo una demo: no crea llamadas ni cuenta como prueba.</p></div><button type="button" onClick={() => onNavigate(`/voz/cabina?agentId=${encodeURIComponent(agentId)}`)}>Abrir cabina (demo)</button></div>
          {uploadedVoiceId && uploadedVoiceId === draft.voiceId ? <p className="agent-simple-consent-ok"><RiCheckLine /> Autorización registrada para tu voz. Guarda los cambios para usarla.</p> : workspace?.activeConsent ? <p className="agent-simple-consent-ok"><RiCheckLine /> Voz autorizada por {workspace.activeConsent.subjectName}{workspace.activeConsent.expiresAt ? ` hasta el ${new Date(workspace.activeConsent.expiresAt).toLocaleDateString()}` : ''}.</p> : <div className="agent-simple-consent-form"><div><RiShieldCheckLine /><span><strong>Autorización de la voz</strong><small>Necesaria si esta voz pertenece o imita a una persona.</small></span></div><label><span>Persona que autoriza</span><input value={consent.subjectName} onChange={event => setConsent(current => ({ ...current, subjectName: event.target.value }))} placeholder="Nombre completo" /></label><div className="agent-simple-consent-grid"><label><span>Contacto (opcional)</span><input value={consent.subjectContact} onChange={event => setConsent(current => ({ ...current, subjectContact: event.target.value }))} placeholder="Email o teléfono" /></label><label><span>Caducidad (opcional)</span><input type="date" value={consent.expiresAt} onChange={event => setConsent(current => ({ ...current, expiresAt: event.target.value }))} /></label></div><label><span>Documento guardado (opcional)</span><input value={consent.evidenceAssetId} onChange={event => setConsent(current => ({ ...current, evidenceAssetId: event.target.value }))} placeholder="Referencia del documento de autorización" /></label><label className="agent-simple-confirm"><input type="checkbox" checked={consent.confirmed} onChange={event => setConsent(current => ({ ...current, confirmed: event.target.checked }))} /><span>Confirmo que esta persona ha autorizado el uso de su voz para llamadas realizadas por este agente.</span></label><button type="button" disabled={!draft.voiceId?.trim() || !consent.subjectName.trim() || !consent.confirmed || consentBusy} onClick={createConsent}>{consentBusy ? 'Registrando…' : 'Registrar autorización'}</button></div>}
        </div> : null}

        {step === 2 ? <div className="agent-simple-form">
          <label><span>¿Qué debe hacer el agente?</span><textarea className="is-large" value={draft.systemPrompt || ''} onChange={event => onChange({ systemPrompt: event.target.value })} placeholder="Ej. Preséntate, pregunta qué necesita el cliente, explica cómo podemos ayudarle y trata de concertar una reunión. Nunca inventes información." autoFocus /></label>
          <p className="agent-simple-tip"><RiShieldCheckLine /> Escribe como si estuvieras explicándole el trabajo a una persona nueva.</p>
        </div> : null}

        {step === 3 ? <div className="agent-simple-form">
          <label><span>Número desde el que llamará</span><input value={draft.phoneNumber || ''} onChange={event => onChange({ phoneNumber: event.target.value })} placeholder="+34910000000" autoFocus /></label>
          <p className={`agent-simple-validation ${completion[3] ? 'is-valid' : ''}`}>{completion[3] ? <RiCheckLine /> : <RiPhoneLine />}{completion[3] ? (check('outboundNumber')?.informative ? 'Formato válido. No se ha podido comprobar contra la pasarela en este entorno.' : 'El número coincide con la línea de la pasarela.') : /^\+[1-9]\d{7,14}$/.test(draft.phoneNumber || '') ? check('outboundNumber')?.detail || 'Guarda para comprobar el número contra la pasarela.' : 'Incluye el prefijo del país, por ejemplo +34.'}</p>
          {workspace?.outboundNumbers?.numbers?.length ? <p className="agent-simple-tip"><RiPhoneLine /> Líneas disponibles: {workspace.outboundNumbers.numbers.map(item => <button type="button" key={item.phone} onClick={() => onChange({ phoneNumber: item.phone })} style={{ marginLeft: 6, font: 'inherit', background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>{item.phone}</button>)}</p> : null}
        </div> : null}

        {step === 4 ? <div className="agent-simple-test">
          {workspace?.latestEvaluation ? <><div className="agent-simple-score"><strong>{workspace.latestEvaluation.overall}</strong><span>puntos sobre 100</span></div><div><h4>{check('test')?.ready ? 'Prueba superada' : 'Conviene repetir la prueba'}</h4><p>{check('test')?.detail || 'La publicación requiere al menos 75 puntos y ningún incumplimiento grave.'}</p></div></> : <><div className="agent-simple-test-icon"><RiPlayLine /></div><div><h4>{workspace?.staleEvaluation ? 'La prueba anterior ya no vale' : workspace?.calls?.some(item => item.status === 'completed' && item.isTest && !item.evaluation) ? 'Hay una llamada lista para evaluar' : 'Aún no hay una prueba válida'}</h4><p>{workspace?.staleEvaluation ? check('test')?.detail : workspace?.calls?.some(item => item.status === 'completed' && item.isTest && !item.evaluation) ? 'Pulsa evaluar y recibirás la nota sin salir de este modo.' : testNumber ? 'El agente te llamará a tu número de prueba. La llamada se graba entera y se evalúa sola al colgar.' : 'Autoriza primero un número propio: la prueba es una llamada telefónica de verdad, no la cabina del navegador.'}</p>{workspace?.testCall && !workspace.testCall.ready && workspace.testCall.blockers?.length ? <small>Falta: {workspace.testCall.blockers.join(', ')}.</small> : null}{testWatch ? <small role="status" aria-live="polite">{testWatch}</small> : null}</div></>}
          <div className="agent-simple-test-actions">
            {testNumber
              ? <button type="button" className="is-primary" disabled={testCalling || !workspace?.testCall?.ready} onClick={startTestCall}>{testCalling ? 'Llamando…' : `Llamar a ${testNumber.phone}`}</button>
              : <button type="button" onClick={() => onOpenGovernance?.('quality')}>Autorizar un número de prueba</button>}
            {workspace?.calls?.some(item => item.status === 'completed') ? <button type="button" disabled={evaluating} onClick={evaluateLatestCall}>{evaluating ? 'Evaluando…' : 'Evaluar última llamada'}</button> : null}
          </div>
        </div> : null}

        {step === 5 ? <div className="agent-simple-publish">
          <div className="agent-simple-readiness">{workspace?.readiness?.checks?.map(item => <div key={item.key} className={item.ready ? 'is-ready' : ''}><span>{item.ready ? <RiCheckLine /> : '·'}</span><strong>{item.label}</strong><small>{item.detail || (item.ready ? 'Completado' : 'Pendiente')}</small></div>)}</div>
          {lifecycle !== 'draft' ? <p className="agent-simple-tip"><RiShieldCheckLine /> Estado actual: {LIFECYCLE[lifecycle].label}. {LIFECYCLE[lifecycle].description}</p> : null}
          <button className="agent-simple-publish-button" type="button" disabled={lifecycle !== 'draft' || !workspace?.readiness?.ready || publishing} onClick={publish}><RiRocket2Line />{publishing ? 'Publicando…' : lifecycle === 'active' ? 'Ya está publicado' : lifecycle !== 'draft' ? 'Reanuda desde la vista profesional' : workspace?.readiness?.ready ? 'Publicar agente' : 'Completa los pasos pendientes'}</button>
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

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { RiArchiveLine, RiArrowRightLine, RiBarChartBoxLine, RiCheckLine, RiCloseLine, RiFileCopyLine, RiHistoryLine, RiInformationLine, RiPhoneLine, RiSettings3Line, RiShieldCheckLine, RiTestTubeLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { assetUrl } from '../../lib/assetUrls'
import { LIFECYCLE, lifecycleOf, apiErrorMessage, readBody } from './agentLifecycle'
import './agent-governance.css'

// Tras «Llamar ahora» la evaluación llega al colgar: se consulta el workspace
// cada 5 s durante 3 minutos hasta ver la llamada evaluada.
const TEST_POLL_INTERVAL_MS = 5000
const TEST_POLL_MAX_MS = 3 * 60 * 1000

const TYPE_OPTIONS = [['sales', 'Ventas'], ['receptionist', 'Recepción'], ['qualification', 'Cualificación'], ['appointment', 'Citas'], ['support', 'Soporte'], ['collections', 'Cobros'], ['handoff', 'Transferencias']]
const COPY_OPTIONS = [['voice', 'Voz'], ['documents', 'Documentos'], ['strategy', 'Estrategia'], ['limits', 'Límites'], ['playbook', 'Playbook']]
const DIMENSIONS = { greeting: 'Saludo', objectionHandling: 'Objeciones', voiceNaturalness: 'Naturalidad', compliance: 'Cumplimiento', closing: 'Cierre' }

const SECTIONS = [
  { id: 'basic', label: 'Datos básicos', icon: RiInformationLine },
  { id: 'performance', label: 'Rendimiento', icon: RiBarChartBoxLine },
  { id: 'quality', label: 'Calidad y publicación', icon: RiShieldCheckLine },
  { id: 'control', label: 'Control y versiones', icon: RiSettings3Line },
]

function Card({ title, description, icon, children, className = '' }) {
  return <section className={`agent-gov-card ${className}`}><header className="agent-gov-card-head"><div className="agent-gov-card-icon">{icon}</div><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div></header>{children}</section>
}

function consentScopeLabel(scope) {
  if (!scope || typeof scope !== 'object') return 'Uso de voz del agente'
  const channels = Array.isArray(scope.channels) ? scope.channels.map(item => item === 'voice' ? 'llamadas de voz' : item) : []
  const purposes = Array.isArray(scope.purposes) ? scope.purposes.map(item => item === 'agent_calls' ? 'llamadas de este agente' : item) : []
  return [...channels, ...purposes].filter(Boolean).join(' · ') || 'Uso de voz del agente'
}

const EMPTY_TEST_NUMBER = { phone: '', label: '', attestation: '', confirmed: false }

export default function AgentGovernancePanel({ agentId, draft, onChange, hasUnsavedChanges, onNavigate, requestedSection, onAgentReload, onWorkspaceLoaded }) {
  const [data, setData] = useState(null)
  const [selectedCampaigns, setSelectedCampaigns] = useState([])
  const [selectedCall, setSelectedCall] = useState('')
  const [selectedTestNumber, setSelectedTestNumber] = useState('')
  const [newTestNumber, setNewTestNumber] = useState(EMPTY_TEST_NUMBER)
  const [testNumberOpen, setTestNumberOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [activeSection, setActiveSection] = useState('basic')
  const [copy, setCopy] = useState({ voice: true, documents: true, strategy: true, limits: true, playbook: true })
  const [testWatch, setTestWatch] = useState(null)
  const pollTimer = useRef(null)

  const load = async () => {
    const response = await apiFetch(`/api/agents/${agentId}/workspace`)
    if (!response.ok) return
    const next = await response.json()
    setData(next)
    onWorkspaceLoaded?.(next)
    setSelectedCampaigns(next.campaigns.filter(item => item.assigned).map(item => item.id))
    setSelectedCall(next.calls.find(item => item.status === 'completed')?.id || '')
    setCloneName(current => current || `${next.agent.name} (copia)`)
    return next
  }
  useEffect(() => { load() }, [agentId])
  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current) }, [])

  const stopWatching = () => { if (pollTimer.current) clearTimeout(pollTimer.current); pollTimer.current = null; setTestWatch(null) }

  const watchTestCall = startedAt => {
    stopWatching()
    const knownCalls = new Set((data?.calls || []).map(item => item.id))
    setTestWatch({ startedAt, status: 'ringing' })
    const tick = async () => {
      const elapsed = Date.now() - startedAt
      const refreshed = await load().catch(() => null)
      const fresh = refreshed?.calls?.find(item => item.isTest && !knownCalls.has(item.id)) || null
      if (fresh?.evaluation?.status === 'completed') {
        const passed = refreshed.readiness?.checks?.find(item => item.key === 'test')?.ready
        setNotice(passed ? `Prueba evaluada: ${fresh.evaluation.overall}/100. Ya cumple el requisito de publicación.` : `Prueba evaluada: ${fresh.evaluation.overall}/100. ${refreshed.readiness?.checks?.find(item => item.key === 'test')?.detail || ''}`)
        setTestWatch({ startedAt, status: 'evaluated', callId: fresh.id })
        pollTimer.current = null
        return
      }
      if (elapsed >= TEST_POLL_MAX_MS) {
        setNotice(fresh ? 'La llamada terminó pero la evaluación todavía no ha llegado. Recarga en un momento o evalúala a mano desde la lista.' : 'No se ha registrado la llamada de prueba en 3 minutos. Si sonó y colgaste, recarga; si no sonó, revisa el número y vuelve a intentarlo.')
        setTestWatch({ startedAt, status: 'timeout' })
        pollTimer.current = null
        return
      }
      setTestWatch({ startedAt, status: fresh ? (fresh.status === 'completed' ? 'evaluating' : 'in_call') : 'ringing', callId: fresh?.id })
      pollTimer.current = setTimeout(tick, TEST_POLL_INTERVAL_MS)
    }
    pollTimer.current = setTimeout(tick, TEST_POLL_INTERVAL_MS)
  }
  useEffect(() => {
    if (SECTIONS.some(section => section.id === requestedSection?.section)) setActiveSection(requestedSection.section)
  }, [requestedSection])

  const act = async (key, url, options = {}) => {
    setBusy(key); setNotice('')
    try {
      const response = await apiFetch(url, options)
      const body = await readBody(response)
      if (!response.ok) throw new Error(apiErrorMessage(body, 'No se pudo completar la acción.') + (body.code && !/^TEST_CALL_BLOCKED/.test(body.code) ? ` (${body.code})` : ''))
      setNotice(body.status === 'published' ? 'Agente publicado correctamente.'
        : body.status === 'paused' ? 'Agente pausado: las campañas dejan de usarlo.'
        : body.status === 'resumed' ? (body.lifecycleStatus === 'active' ? 'Agente reanudado y publicado: seguía cumpliendo todos los requisitos.' : `Agente reanudado como borrador. ${apiErrorMessage({ blockers: body.blockers }, 'Vuelve a publicarlo cuando esté listo.')}`)
        : body.status === 'started' ? `Llamando a ${body.to}. Cuando cuelgues, la evaluación aparecerá aquí sola.`
        : 'Cambio aplicado correctamente.')
      if (body.status === 'started') watchTestCall(Date.now())
      const refreshed = await load()
      if (key === 'restore' && refreshed?.agent) onAgentReload?.(refreshed.agent)
      return body
    } catch (error) { setNotice(error.message) } finally { setBusy('') }
  }

  const confirmThen = (message, run) => { if (window.confirm(message)) return run() }

  const compare = useMemo(() => {
    if (!data?.agent) return []
    const labels = { name: 'Nombre', role: 'Función', description: 'Descripción', agentType: 'Tipo', phoneNumber: 'Número', monthlyMinuteLimit: 'Límite mensual', systemPrompt: 'Instrucciones', voiceId: 'Voz' }
    return Object.entries(labels).filter(([key]) => JSON.stringify(data.agent[key] ?? '') !== JSON.stringify(draft[key] ?? '')).map(([key, label]) => ({ label, before: data.agent[key] || 'Sin definir', after: draft[key] || 'Sin definir' }))
  }, [data, draft])

  if (!data) return <div className="agent-gov-loading">Cargando gestión del agente…</div>
  const usage = data.usage || {}
  const commercial = data.commercial || {}
  const evaluation = data.latestEvaluation

  const assignedCampaigns = data.campaigns.filter(item => item.assigned).length
  const missingRequirements = data.readiness.checks.filter(item => !item.ready).length
  const testCall = data.testCall || { numbers: [], blockers: [], dailyLimit: 0, callsToday: 0, ready: false }
  const activeTestNumbers = (testCall.numbers || []).filter(item => item.active)
  const lifecycle = lifecycleOf(data.agent)
  const testWatchLabel = testWatch ? ({ ringing: 'Marcando… descuelga en tu número de prueba.', in_call: 'Llamada en curso. Al colgar se evaluará sola.', evaluating: 'Llamada terminada: evaluando la conversación…', evaluated: 'Evaluación recibida.', timeout: 'Sin novedades en 3 minutos.' })[testWatch.status] : ''

  return <div id="agent-governance" className="agent-gov">
    <section className="agent-gov-overview">
      <div className="agent-gov-overview-copy">
        <h2>Gestión del agente</h2>
        <p>Configura lo esencial, mide su trabajo y controla cada cambio.</p>
        <span className={data.readiness.ready ? 'is-ready' : 'is-warning'}>{data.readiness.ready ? <RiCheckLine /> : <RiInformationLine />}{LIFECYCLE[lifecycle].label} · {data.readiness.ready ? 'requisitos completos' : `${missingRequirements} ${missingRequirements === 1 ? 'requisito pendiente' : 'requisitos pendientes'}`}</span>
      </div>
      <div className="agent-gov-overview-stats">
        <div><span>Número de salida</span><strong>{draft.phoneNumber || 'Sin asignar'}</strong></div>
        <div><span>Campañas</span><strong>{assignedCampaigns}</strong></div>
        <div><span>Prueba válida</span><strong>{evaluation?.overall != null ? `${evaluation.overall}/100` : data.staleEvaluation ? 'Repetir' : 'Sin evaluar'}</strong></div>
        <div><span>Consumo mensual</span><strong>{usage.minutes || 0} min</strong></div>
      </div>
      {lifecycle === 'active'
        ? <button className="agent-gov-primary agent-gov-publish" disabled={busy === 'pause'} onClick={() => act('pause', `/api/agents/${agentId}/pause`, { method: 'POST' })}>{busy === 'pause' ? 'Pausando…' : 'Pausar agente'}</button>
        : lifecycle === 'paused'
          ? <button className="agent-gov-primary agent-gov-publish" disabled={busy === 'resume'} onClick={() => act('resume', `/api/agents/${agentId}/resume`, { method: 'POST' })}>{busy === 'resume' ? 'Reanudando…' : 'Reanudar agente'}</button>
          : <button className="agent-gov-primary agent-gov-publish" disabled={lifecycle === 'archived' || !data.readiness.ready || busy === 'publish'} onClick={() => act('publish', `/api/agents/${agentId}/publish`, { method: 'POST' })}>{busy === 'publish' ? 'Publicando…' : lifecycle === 'archived' ? 'Agente archivado' : 'Publicar agente'}</button>}
    </section>

    {notice ? <p className="agent-gov-notice" role="status">{notice}</p> : null}

    <nav className="agent-gov-nav" aria-label="Áreas de gestión">
      {SECTIONS.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={activeSection === id ? 'is-active' : ''} onClick={() => setActiveSection(id)} aria-current={activeSection === id ? 'page' : undefined}><Icon /><span>{label}</span>{id === 'basic' && hasUnsavedChanges ? <i>{compare.length}</i> : null}{id === 'quality' && missingRequirements ? <i>{missingRequirements}</i> : null}</button>)}
    </nav>

    <div className="agent-gov-content">
      {activeSection === 'basic' ? <div className="agent-gov-layout is-main-aside">
        <Card title="Identidad y funcionamiento" description="La información que define qué hace este agente." icon={<RiInformationLine />}>
          <div className="agent-gov-form">
            <label><span>Nombre</span><input value={draft.name || ''} onChange={e => onChange({ name: e.target.value })} /></label>
            <label><span>Función</span><input value={draft.role || ''} onChange={e => onChange({ role: e.target.value })} /></label>
            <label><span>Tipo de agente</span><select value={draft.agentType || 'sales'} onChange={e => onChange({ agentType: e.target.value })}>{TYPE_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Número desde el que llama</span><input value={draft.phoneNumber || ''} onChange={e => onChange({ phoneNumber: e.target.value })} placeholder="+34910000000" /></label>
            <label><span>Límite mensual de minutos</span><input type="number" min="1" value={draft.monthlyMinuteLimit || ''} onChange={e => onChange({ monthlyMinuteLimit: e.target.value ? Number(e.target.value) : null })} placeholder="Sin límite" /></label>
            <label className="agent-gov-span"><span>Descripción</span><textarea value={draft.description || ''} onChange={e => onChange({ description: e.target.value })} placeholder="Qué hace y cuándo debe utilizarse" /></label>
          </div>
        </Card>
        <div className="agent-gov-aside">
          <Card title="Campañas" description="Dónde está trabajando ahora." icon={<RiPhoneLine />}>
            <div className="agent-gov-list">{data.campaigns.length ? data.campaigns.map(item => <label className="agent-gov-choice" key={item.id}><input type="checkbox" checked={selectedCampaigns.includes(item.id)} onChange={e => setSelectedCampaigns(current => e.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><span><strong>{item.name}</strong><small>{item.status}</small></span></label>) : <p className="agent-gov-empty">No hay campañas creadas.</p>}</div>
            <button onClick={() => act('campaigns', `/api/agents/${agentId}/campaigns`, { method: 'PUT', body: JSON.stringify({ campaignIds: selectedCampaigns }) })} disabled={busy === 'campaigns'}>Guardar asignación</button>
          </Card>
          <Card title="Cambios pendientes" description="Compara antes de guardar." icon={<RiHistoryLine />}>
            {!hasUnsavedChanges || !compare.length ? <p className="agent-gov-empty">Todo coincide con la versión guardada.</p> : <div className="agent-gov-compare">{compare.map(item => <div key={item.label}><strong>{item.label}</strong><span><del>{String(item.before)}</del><RiArrowRightLine className="agent-gov-arrow" aria-hidden="true" /><ins>{String(item.after)}</ins></span></div>)}</div>}
          </Card>
        </div>
      </div> : null}

      {activeSection === 'performance' ? <div className="agent-gov-layout is-performance">
        <Card title="Resultado comercial" description="Resultados obtenidos por las llamadas del agente." icon={<RiBarChartBoxLine />} className="agent-gov-wide">
          <div className="agent-gov-metrics is-six"><div><strong>{commercial.total || 0}</strong><span>Llamadas</span></div><div><strong>{commercial.answered || 0}</strong><span>Contestadas</span></div><div><strong>{commercial.meetings || 0}</strong><span>Reuniones</span></div><div><strong>{commercial.transfers || 0}</strong><span>Transferencias</span></div><div><strong>{commercial.sales || 0}</strong><span>Ventas</span></div><div><strong>{commercial.salesValue || 0} €</strong><span>Valor vendido</span></div></div>
          <div className="agent-gov-two"><div><h4>Objeciones principales</h4>{commercial.objections?.length ? commercial.objections.map(item => <p key={item.label}>{item.label}<b>{item.count}</b></p>) : <small>Sin objeciones detectadas</small>}</div><div><h4>Motivos de fracaso</h4>{commercial.lossReasons?.length ? commercial.lossReasons.map(item => <p key={item.label}>{item.label}<b>{item.count}</b></p>) : <small>Sin pérdidas registradas</small>}</div></div>
        </Card>
        <Card title="Costes y consumo" description="Uso acumulado durante el mes actual." icon={<RiPhoneLine />} className="agent-gov-wide">
          <div className="agent-gov-metrics is-four"><div><strong>{usage.minutes || 0}</strong><span>Minutos</span></div><div><strong>{((usage.costCents || 0) / 100).toFixed(2)} €</strong><span>Coste del mes</span></div><div><strong>{((usage.averageCostCents || 0) / 100).toFixed(2)} €</strong><span>Media por llamada</span></div><div><strong>{usage.monthlyMinuteLimit || '∞'}</strong><span>Límite mensual</span></div></div><div className="agent-gov-usage-label"><span>Uso del límite</span><strong>{usage.percentage || 0}%</strong></div><div className="agent-gov-progress"><i style={{ width: `${usage.percentage || 0}%` }} /></div>
        </Card>
      </div> : null}

      {activeSection === 'quality' ? <div className="agent-gov-layout is-quality">
        <Card title="Prueba real evaluada" description="Llama a un número propio con el agente todavía en borrador y evalúa esa conversación." icon={<RiTestTubeLine />}>
          <div className="agent-gov-testcall">
            <div className="agent-gov-test-row">
              <select value={selectedTestNumber} onChange={e => setSelectedTestNumber(e.target.value)} disabled={!activeTestNumbers.length}>
                <option value="">{activeTestNumbers.length ? 'Selecciona el número al que llamar' : 'Todavía no hay números de prueba'}</option>
                {activeTestNumbers.map(item => <option key={item.id} value={item.id}>{item.label} · {item.phone}</option>)}
              </select>
              <button disabled={!selectedTestNumber || !testCall.ready || busy === 'test-call'} onClick={() => act('test-call', `/api/agents/${agentId}/test-calls`, { method: 'POST', body: JSON.stringify({ testNumberId: selectedTestNumber }) })}>{busy === 'test-call' ? 'Llamando…' : 'Llamar ahora'}</button>
            </div>
            <p className="agent-gov-testcall-quota">{testCall.callsToday || 0} de {testCall.dailyLimit} pruebas usadas hoy. La llamada se graba entera y queda en el historial marcada como prueba.</p>
            {testWatch ? <p className="agent-gov-testcall-quota" role="status" aria-live="polite"><RiPhoneLine /> {testWatchLabel}{testWatch.status !== 'evaluated' && testWatch.status !== 'timeout' ? <button type="button" onClick={stopWatching} style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Dejar de esperar</button> : null}</p> : null}
            {testCall.blockers?.length ? <ul className="agent-gov-testcall-blockers">{testCall.blockers.map(item => <li key={item}><RiCloseLine />{item}</li>)}</ul> : null}
            {data.staleEvaluation && !evaluation ? <p className="agent-gov-testcall-quota">La prueba anterior ({data.staleEvaluation.overall}/100) es anterior a los últimos cambios de guion, voz, estrategia o playbook: hay que repetirla.</p> : null}

            <div className="agent-gov-testcall-numbers">
              {testCall.numbers?.length ? testCall.numbers.map(item => <article className="agent-gov-consent" key={item.id}>
                <div><strong>{item.label}</strong><em className={item.active ? 'is-active' : 'is-revoked'}>{item.active ? 'activo' : 'revocado'}</em></div>
                <span>{item.phone}</span>
                <span className="agent-gov-scope">Declaración: {item.attestation}</span>
                {item.active ? <div className="agent-gov-consent-actions"><button className="is-danger" onClick={() => act('test-number', `/api/agents/${agentId}/test-numbers/${item.id}/revoke`, { method: 'POST' })}>Dar de baja</button></div> : null}
              </article>) : null}
            </div>

            <button className="agent-gov-secondary-wide" type="button" onClick={() => setTestNumberOpen(value => !value)}>{testNumberOpen ? 'Cancelar' : 'Autorizar un número de prueba'}</button>
            {testNumberOpen ? <div className="agent-gov-form agent-gov-testcall-form">
              <label><span>Teléfono</span><input value={newTestNumber.phone} onChange={e => setNewTestNumber(current => ({ ...current, phone: e.target.value }))} placeholder="+34600000000" /></label>
              <label><span>Nombre</span><input value={newTestNumber.label} onChange={e => setNewTestNumber(current => ({ ...current, label: e.target.value }))} placeholder="Mi móvil" /></label>
              <label className="agent-gov-span"><span>Declaración</span><textarea value={newTestNumber.attestation} onChange={e => setNewTestNumber(current => ({ ...current, attestation: e.target.value }))} placeholder="De quién es el número y por qué puedes llamarlo para probar." /></label>
              <label className="agent-gov-span agent-gov-choice"><input type="checkbox" checked={newTestNumber.confirmed} onChange={e => setNewTestNumber(current => ({ ...current, confirmed: e.target.checked }))} /><span>Este número es mío o su titular acepta recibir llamadas de prueba grabadas.</span></label>
              <button className="agent-gov-primary agent-gov-span" disabled={!newTestNumber.confirmed || newTestNumber.attestation.trim().length < 20 || !newTestNumber.phone.trim() || busy === 'test-number'} onClick={async () => {
                const created = await act('test-number', `/api/agents/${agentId}/test-numbers`, { method: 'POST', body: JSON.stringify({ ...newTestNumber, label: newTestNumber.label.trim(), confirmed: true }) })
                if (created?.id) { setNewTestNumber(EMPTY_TEST_NUMBER); setTestNumberOpen(false); setSelectedTestNumber(created.id) }
              }}>{busy === 'test-number' ? 'Guardando…' : 'Autorizar número'}</button>
            </div> : null}
          </div>

          <div className="agent-gov-test-row"><select value={selectedCall} onChange={e => setSelectedCall(e.target.value)}><option value="">Selecciona una llamada completada</option>{data.calls.filter(call => call.status === 'completed').map(call => <option key={call.id} value={call.id}>{new Date(call.createdAt).toLocaleString()} · {call.outcome}{call.isTest ? ' · prueba' : ''}</option>)}</select><button disabled={!selectedCall || busy === 'evaluate'} onClick={() => act('evaluate', `/api/agents/${agentId}/evaluations/${selectedCall}`, { method: 'POST' })}>{busy === 'evaluate' ? 'Evaluando…' : 'Evaluar llamada'}</button></div>
          {evaluation ? <div className="agent-gov-scores"><div className="is-overall"><strong>{evaluation.overall}</strong><span>Nota total</span></div>{Object.entries(DIMENSIONS).map(([key, label]) => <div key={key}><strong>{evaluation.dimensions?.[key] ?? '—'}</strong><span>{label}</span></div>)}</div> : <p className="agent-gov-empty agent-gov-empty-room">Aún no hay una llamada real evaluada. La simulación escrita no cuenta para publicar.</p>}
        </Card>
        <div className="agent-gov-aside">
          <Card title="Requisitos para publicar" description={`${data.readiness.checks.filter(item => item.ready).length} de ${data.readiness.checks.length} completados`} icon={<RiShieldCheckLine />}>
            <div className="agent-gov-checks">{data.readiness.checks.map(item => <div key={item.key} className={item.ready ? 'is-ready' : 'is-blocked'} title={item.detail || ''}>{item.ready ? <RiCheckLine /> : <RiCloseLine />}<span>{item.label}{item.detail ? <small style={{ display: 'block', opacity: .75 }}>{item.detail}</small> : null}</span></div>)}</div>
            <button className="agent-gov-primary" disabled={lifecycle !== 'draft' || !data.readiness.ready || busy === 'publish'} onClick={() => act('publish', `/api/agents/${agentId}/publish`, { method: 'POST' })}>{busy === 'publish' ? 'Publicando…' : lifecycle === 'active' ? 'Ya publicado' : lifecycle === 'paused' ? 'Reanuda para publicar' : 'Publicar agente'}</button>
          </Card>
          <Card title="Consentimiento de voz" description="Autorizaciones vinculadas a esta voz." icon={<RiShieldCheckLine />}>
            {data.consents.length ? data.consents.map(consent => <article className="agent-gov-consent" key={consent.id}><div><strong>{consent.subjectName}</strong><em className={`is-${consent.status}`}>{consent.status}</em></div><span>Concedido: {new Date(consent.grantedAt).toLocaleDateString()}</span><span>Caduca: {consent.expiresAt ? new Date(consent.expiresAt).toLocaleDateString() : 'Sin caducidad'}</span><span className="agent-gov-scope">Alcance: {consentScopeLabel(consent.scope)}</span><div className="agent-gov-consent-actions">{consent.evidenceAssetId ? <button onClick={async () => { const url = await assetUrl(consent.evidenceAssetId); if (url) window.open(url, '_blank', 'noopener,noreferrer') }}>Ver autorización</button> : null}{consent.status === 'active' ? <button className="is-danger" onClick={() => act('consent', `/api/agents/${agentId}/consents/${consent.id}/revoke`, { method: 'POST' })}>Revocar</button> : null}</div></article>) : <p className="agent-gov-empty">No hay una autorización vinculada.</p>}
          </Card>
        </div>
      </div> : null}

      {activeSection === 'control' ? <div className="agent-gov-layout is-main-aside">
        <Card title="Historial de versiones" description="Quién cambió el agente, cuándo y qué modificó." icon={<RiHistoryLine />}>
          <div className="agent-gov-history">{data.versions.map((version, index) => <article key={version.id}><div className="agent-gov-version-number">v{version.version}</div><div><strong>{index === 0 ? 'Versión actual' : `Versión ${version.version}`}</strong><span>{version.actor?.name || version.actor?.email || 'Sistema'} · {new Date(version.createdAt).toLocaleString()}</span><small>{version.changedFields.join(', ')}</small></div>{index > 0 ? <button onClick={() => act('restore', `/api/agents/${agentId}/versions/${version.id}/restore`, { method: 'POST' })}>Restaurar</button> : null}</article>)}</div>
        </Card>
        <div className="agent-gov-aside">
          <Card title="Duplicar agente" description="Elige exactamente qué quieres copiar." icon={<RiFileCopyLine />}>
            <button className="agent-gov-secondary-wide" onClick={() => setCloneOpen(value => !value)}>{cloneOpen ? 'Cancelar duplicación' : 'Configurar duplicación'}</button>
            {cloneOpen ? <div className="agent-gov-clone"><label className="agent-gov-clone-name"><span>Nombre de la copia</span><input value={cloneName} onChange={event => setCloneName(event.target.value)} /></label><div className="agent-gov-copy-options">{COPY_OPTIONS.map(([key, label]) => <label key={key}><input type="checkbox" checked={copy[key]} onChange={e => setCopy(current => ({ ...current, [key]: e.target.checked }))} /><span>{label}</span></label>)}</div><button className="agent-gov-primary" disabled={!cloneName.trim() || busy === 'clone'} onClick={async () => { const created = await act('clone', `/api/agents/${agentId}/clone`, { method: 'POST', body: JSON.stringify({ ...copy, name: cloneName }) }); if (created?.id) onNavigate(`/agentes/${created.id}`) }}>{busy === 'clone' ? 'Creando copia…' : 'Crear copia'}</button></div> : null}
          </Card>
          <Card title="Ciclo de vida" description="Las acciones delicadas están separadas del uso diario." icon={<RiArchiveLine />} className="agent-gov-danger-zone">
            <p>Archivar detiene el agente sin borrar su historial. La eliminación solo está disponible cuando ya no tiene llamadas ni campañas.</p>
            <div className="agent-gov-actions"><button className="is-danger" disabled={lifecycle === 'archived'} onClick={() => confirmThen(`¿Archivar a ${data.agent.name}? Dejará de estar disponible para campañas y pruebas. Podrás consultar su historial.`, () => act('archive', `/api/agents/${agentId}/archive`, { method: 'POST' }))}>Archivar agente</button><button className="is-danger" disabled={lifecycle !== 'archived'} onClick={() => confirmThen(`¿Eliminar definitivamente a ${data.agent.name}? Esta acción no se puede deshacer.`, async () => { const result = await act('delete', `/api/agents/${agentId}/permanent`, { method: 'DELETE' }); if (result?.ok) onNavigate('/agentes') })}>Eliminar definitivamente</button></div>
          </Card>
        </div>
      </div> : null}
    </div>
  </div>
}

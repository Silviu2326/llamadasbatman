import { useEffect, useMemo, useState } from 'react'
import {
  RiAlertLine,
  RiArrowRightLine,
  RiCheckboxCircleLine,
  RiFileList3Line,
  RiFileShield2Line,
  RiGovernmentLine,
  RiLock2Line,
  RiRefreshLine,
  RiSave3Line,
  RiScales3Line,
  RiShieldCheckLine,
  RiTimeLine,
} from 'react-icons/ri'
import { apiFetch } from '../lib/api'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import { getLocale, localeCode, useI18n } from '../i18n'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import './enterprise-governance.css'

const POLICY_META = {
  consent: {
    label: 'Consentimiento y preferencias',
    description: 'Define qué pruebas, comunicaciones y automatizaciones requieren una base de consentimiento verificable.',
    icon: RiShieldCheckLine,
    tone: 'cyan',
  },
  cost: {
    label: 'Controles de coste',
    description: 'Establece límites y avisos para proteger el presupuesto antes de escalar una operación.',
    icon: RiScales3Line,
    tone: 'amber',
  },
  approval: {
    label: 'Aprobaciones operativas',
    description: 'Exige revisión humana antes de publicar aprendizajes, playbooks o cambios sensibles.',
    icon: RiFileShield2Line,
    tone: 'violet',
  },
}

function displayDate(value) {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin registro'
  return new Intl.DateTimeFormat(localeCode(getLocale()), { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function policyMeta(key) {
  const normalizedKey = String(key || '').toLocaleLowerCase(localeCode(getLocale()))
  if (normalizedKey.includes('consent')) return POLICY_META.consent
  if (normalizedKey.includes('cost') || normalizedKey.includes('budget')) return POLICY_META.cost
  if (normalizedKey.includes('approval') || normalizedKey.includes('memory')) return POLICY_META.approval
  return {
    label: String(key || 'Política').replaceAll('_', ' '),
    description: 'Regla de gobierno configurada para esta organización.',
    icon: RiGovernmentLine,
    tone: 'slate',
  }
}

function normalizeOverview(payload) {
  const source = payload?.overview || payload?.data || payload || {}
  return {
    policies: Array.isArray(source.policies) ? source.policies : [],
    counts: source.counts && typeof source.counts === 'object' ? source.counts : {},
    recentAuditEvents: Array.isArray(source.recentAuditEvents) ? source.recentAuditEvents : [],
    // Capability flags are authoritative. If the backend omits the flag,
    // keep the UI read-only rather than guessing from the user's role.
    canManagePolicies: source.canManagePolicies === true,
  }
}

function configText(config) {
  if (!config || (typeof config === 'object' && Object.keys(config).length === 0)) return ''
  if (typeof config === 'string') return config
  try {
    return JSON.stringify(config, null, 2)
  } catch {
    return ''
  }
}

function StatCard({ icon: Icon, label, value, description }) {
  const visibleValue = Number.isFinite(Number(value)) ? Number(value) : '—'
  return <article className="governance-stat-card">
    <span className="governance-stat-icon"><Icon aria-hidden="true" /></span>
    <div><span>{label}</span><strong>{visibleValue}</strong><small>{description}</small></div>
  </article>
}

function PolicyCard({ policy, canManage, onSave, savingKey }) {
  const [editing, setEditing] = useState(false)
  const [enabled, setEnabled] = useState(Boolean(policy.enabled))
  const [rawConfig, setRawConfig] = useState(() => configText(policy.config))
  const [validationError, setValidationError] = useState('')
  const meta = policyMeta(policy.key)
  const Icon = meta.icon
  const isSaving = savingKey === policy.key

  useEffect(() => {
    setEnabled(Boolean(policy.enabled))
    setRawConfig(configText(policy.config))
    setValidationError('')
  }, [policy.config, policy.enabled, policy.key])

  function cancelEdit() {
    setEnabled(Boolean(policy.enabled))
    setRawConfig(configText(policy.config))
    setValidationError('')
    setEditing(false)
  }

  function submit(event) {
    event.preventDefault()
    let parsedConfig
    if (rawConfig.trim()) {
      try {
        parsedConfig = JSON.parse(rawConfig)
      } catch {
        setValidationError('La configuración debe ser un JSON válido antes de poder guardarla.')
        return
      }
    }
    onSave(policy.key, { enabled, ...(parsedConfig === undefined ? {} : { config: parsedConfig }) }, () => setEditing(false))
  }

  return <article className={`governance-policy ${meta.tone}`}>
    <div className="governance-policy-icon"><Icon aria-hidden="true" /></div>
    <div className="governance-policy-body">
      <div className="governance-policy-heading">
        <div>
          <span className="governance-eyebrow">{policy.key || 'Política'}</span>
          <h3>{meta.label}</h3>
          <p>{meta.description}</p>
        </div>
        <span className={`governance-status ${policy.enabled ? 'active' : 'paused'}`}><i />{policy.enabled ? 'Activa' : 'Pausada'}</span>
      </div>
      <p className="governance-policy-update"><RiTimeLine aria-hidden="true" />Última actualización: {displayDate(policy.updatedAt)}</p>
      {editing ? <form className="governance-policy-form" onSubmit={submit}>
        <label className="governance-switch">
          <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
          <span aria-hidden="true" />
          <b>Aplicar esta política</b>
        </label>
        <label className="governance-config-field">
          <span>Configuración JSON</span>
          <textarea value={rawConfig} onChange={event => { setRawConfig(event.target.value); setValidationError('') }} rows="7" spellCheck="false" placeholder={'{\n  "limit": 0\n}'} aria-describedby={`policy-help-${policy.key}`} />
          <small id={`policy-help-${policy.key}`}>Los valores se validan en el servidor y solo se aplican si tu rol tiene permiso.</small>
        </label>
        {validationError ? <p className="governance-inline-error" role="alert"><RiAlertLine aria-hidden="true" />{validationError}</p> : null}
        <div className="governance-policy-actions">
          <button type="button" className="governance-button subtle" onClick={cancelEdit} disabled={isSaving}>Cancelar</button>
          <button type="submit" className="governance-button primary" disabled={isSaving}>{isSaving ? <RiRefreshLine className="governance-spin" /> : <RiSave3Line />}{isSaving ? 'Guardando' : 'Guardar política'}</button>
        </div>
      </form> : <div className="governance-policy-actions">
        {canManage ? <button type="button" className="governance-button subtle" onClick={() => setEditing(true)}><RiLock2Line />Editar con permisos</button> : <span className="governance-readonly"><RiLock2Line aria-hidden="true" />Tu rol puede consultar, no modificar</span>}
      </div>}
    </div>
  </article>
}

function AuditEvent({ event }) {
  const title = event.action || event.type || event.event || 'Evento de auditoría'
  const detail = event.summary || event.description || event.entityType || 'Cambio registrado por el sistema.'
  return <li>
    <span className="governance-audit-dot" aria-hidden="true" />
    <div><strong>{title}</strong><p>{detail}</p><time dateTime={event.createdAt || event.timestamp}>{displayDate(event.createdAt || event.timestamp)}</time></div>
  </li>
}

export default function EnterpriseGovernancePage() {
  const { locale } = useI18n()
  const [overview, setOverview] = useState(() => normalizeOverview(null))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [planGate, setPlanGate] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [notice, setNotice] = useState('')

  async function loadOverview() {
    setLoading(true)
    setLoadError('')
    setPlanGate(null)
    try {
      const response = await apiFetch('/api/revenue-intelligence/governance/overview')
      // Se comprueba antes de leer el cuerpo: readPlanGate necesita clonar la respuesta intacta.
      const gate = response.ok ? null : await readPlanGate(response)
      if (gate) { setOverview(normalizeOverview(null)); setPlanGate(gate); return }
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la configuración de gobierno.')
      setOverview(normalizeOverview(payload))
    } catch (error) {
      setOverview(normalizeOverview(null))
      setLoadError(error.message || 'No se pudo cargar la configuración de gobierno.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadOverview() }, [])

  const governedWork = useMemo(() => [
    { icon: RiFileList3Line, label: 'Acciones pendientes', value: overview.counts.pendingActions, description: 'recomendaciones a supervisar' },
    { icon: RiFileShield2Line, label: 'Aprobaciones', value: overview.counts.pendingMemoryProposals, description: 'aprendizajes pendientes de revisión' },
    { icon: RiArrowRightLine, label: 'Experimentos activos', value: overview.counts.activeExperiments, description: 'pruebas bajo control' },
    { icon: RiTimeLine, label: 'Eventos auditados', value: overview.counts.auditEvents, description: 'eventos recientes registrados' },
  ], [overview.counts])

  async function savePolicy(key, input, onSuccess) {
    setSavingKey(key)
    setSaveError('')
    setNotice('')
    try {
      const response = await apiFetch(`/api/revenue-intelligence/governance/policies/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar la política.')
      const saved = payload?.policy || payload?.data || payload
      setOverview(current => ({
        ...current,
        policies: current.policies.map(policy => policy.key === key ? { ...policy, ...saved } : policy),
      }))
      setNotice('Política guardada. El servidor ha aplicado sus controles de acceso.')
      onSuccess?.()
    } catch (error) {
      setSaveError(error.message || 'No se pudo guardar la política.')
    } finally {
      setSavingKey('')
    }
  }

  return <main className="governance-page">
    <header className="governance-header">
      <div className="governance-heading"><span className="governance-brand-icon"><RiGovernmentLine aria-hidden="true" /></span><div><h1>{locale === 'en' ? 'Enterprise governance' : 'Gobierno empresarial'}</h1><p>{locale === 'en' ? 'Protect consent, budget and operational decisions without taking people out of control.' : 'Protege consentimiento, presupuesto y decisiones operativas sin apartar a las personas del control.'}</p></div></div>
      <button type="button" className="governance-button subtle" onClick={loadOverview} disabled={loading}><RiRefreshLine className={loading ? 'governance-spin' : ''} />{locale === 'en' ? 'Refresh' : 'Actualizar'}</button>
    </header>

    <section className="governance-command" aria-label="Principios de gobierno empresarial">
      <div><span className="governance-eyebrow">Decisiones con trazabilidad</span><h2>La automatización avanza dentro de límites revisables.</h2><p>Las políticas no sustituyen la revisión humana: documentan qué se permite, quién puede cambiarlo y qué ocurrió después.</p></div>
      <div className="governance-command-icons" aria-hidden="true"><RiShieldCheckLine /><i /><RiScales3Line /><i /><RiFileShield2Line /></div>
    </section>

    {planGate ? <DataStatusBanner status="plan" message={planGateMessage(planGate, locale)} /> : null}

    {saveError ? <div className="governance-page-error" role="alert"><RiAlertLine aria-hidden="true" /><div><strong>No se guardó el cambio</strong><span>{saveError}</span></div><button type="button" onClick={() => setSaveError('')} aria-label="Cerrar aviso">×</button></div> : null}

    {loading ? <section className="governance-state loading" aria-live="polite"><span /><p>Cargando las políticas de tu organización…</p></section> : loadError ? <section className="governance-state error" role="alert"><RiAlertLine aria-hidden="true" /><h2>No pudimos cargar el gobierno empresarial</h2><p>{loadError}</p><button type="button" className="governance-button subtle" onClick={loadOverview}><RiRefreshLine />Reintentar</button></section> : <>
      <section className="governance-stats" aria-label="Resumen de operación gobernada">{governedWork.map(item => <StatCard key={item.label} {...item} />)}</section>

      <section className="governance-workspace">
        <div className="governance-main-panel">
          <div className="governance-section-heading"><div><span className="governance-eyebrow">Políticas activas</span><h2>Controles que aplican a la organización</h2><p>La interfaz muestra el estado real recibido. El servidor decide si tu rol puede modificarlo.</p></div></div>
          {overview.policies.length ? <div className="governance-policy-list">{overview.policies.map(policy => <PolicyCard key={policy.key} policy={policy} canManage={overview.canManagePolicies} onSave={savePolicy} savingKey={savingKey} />)}</div> : <div className="governance-empty"><span><RiShieldCheckLine aria-hidden="true" /></span><h3>Aún no hay políticas configuradas</h3><p>Cuando tu organización defina sus políticas, aparecerán aquí con su estado y trazabilidad. No se muestran valores de ejemplo.</p></div>}
        </div>
        <aside className="governance-side-panel">
          <div className="governance-audit-heading"><span className="governance-eyebrow">Auditoría reciente</span><h2>Qué ha cambiado</h2><p>Un extracto de eventos registrados para revisar el impacto de las decisiones.</p></div>
          {overview.recentAuditEvents.length ? <ol className="governance-audit-list">{overview.recentAuditEvents.map((event, index) => <AuditEvent key={event.id || `${event.createdAt || event.timestamp || 'event'}-${index}`} event={event} />)}</ol> : <div className="governance-audit-empty"><RiFileList3Line aria-hidden="true" /><p>Aún no hay eventos de auditoría disponibles para esta organización.</p></div>}
          <div className="governance-human-note"><RiLock2Line aria-hidden="true" /><p><strong>Control humano</strong>Los cambios de política se envían al servidor, que los valida, aplica RBAC y deja el rastro de auditoría correspondiente.</p></div>
        </aside>
      </section>
    </>}

    {notice ? <div className="governance-toast" role="status"><RiCheckboxCircleLine aria-hidden="true" />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div> : null}
  </main>
}

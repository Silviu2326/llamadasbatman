import { useEffect, useState } from 'react'
import { RiBankCardLine, RiBarChartLine, RiMailSendLine, RiVipCrownLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import '../more-center.css'
import './configuracion.css'

function formatCents(value) {
  const cents = Number(value ?? 0)
  return (Number.isFinite(cents) ? cents / 100 : 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function Metric({ label, value }) {
  return <div className="settings-metric"><span>{label}</span><strong>{value}</strong></div>
}

const PLAN_LABELS = { free: 'Gratis', pro: 'Arranque', completo: 'Crecimiento', agency: 'Agencias' }
const PLAN_PRICES = { pro: '99 €/mes', completo: '299 €/mes', agency: 'A medida' }

/**
 * Plan y facturación: antes vivía en el rail derecho de Configuración y en un
 * modal. Ahora es una sección con entidad propia dentro de /configuracion.
 */
export default function PlanBillingPage() {
  const [stats, setStats] = useState(null)
  const [agentCount, setAgentCount] = useState(null)
  const [integrations, setIntegrations] = useState(null)
  const [billingConfig, setBillingConfig] = useState(null)
  const [usage, setUsage] = useState(null)
  const [platformMetrics, setPlatformMetrics] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/dashboard/stats').then(r => (r.ok ? r.json() : null)).then(data => { if (data) setStats(data) }).catch(() => {})
    apiFetch('/api/agents').then(r => (r.ok ? r.json() : null)).then(data => setAgentCount(Array.isArray(data) ? data.length : null)).catch(() => {})
    apiFetch('/api/settings/integrations').then(r => (r.ok ? r.json() : null)).then(data => { if (data) setIntegrations(data) }).catch(() => {})
    apiFetch('/api/billing/config').then(r => (r.ok ? r.json() : null)).then(setBillingConfig).catch(() => {})
    apiFetch('/api/billing/usage').then(r => (r.ok ? r.json() : null)).then(setUsage).catch(() => {})
    // 403 es normal para roles sin acceso financiero: no se enseña una caja
    // vacía ni se degrada el resto de la sección.
    apiFetch('/api/outcomes/open-platform?days=30').then(r => (r.ok ? r.json() : null)).then(setPlatformMetrics).catch(() => {})
  }, [])

  const currentPlan = stats?.orgPlan ?? integrations?.plan ?? 'free'

  async function startCheckout(plan) {
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.url) throw new Error(body.error || 'No se pudo iniciar el pago')
      window.location.href = body.url
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function openBillingPortal() {
    setBusy(true)
    setError('')
    try {
      const response = await apiFetch('/api/billing/portal', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.url) throw new Error(body.error || 'No se pudo abrir el portal')
      window.location.href = body.url
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <section className="more-center-page dark-scroll">
      <div className="more-center-body settings-plan-grid">
        <article className="settings-card">
          <header>
            <span className="settings-card-icon"><RiVipCrownLine /></span>
            <div><h2>Tu plan actual</h2><p>El plan fija qué módulos y qué límites tiene la organización.</p></div>
          </header>
          <div className="settings-plan-current">
            <strong>{PLAN_LABELS[currentPlan] || currentPlan}</strong>
            <span className="settings-badge">Activo</span>
          </div>
          {billingConfig?.enabled ? (
            <>
              <p className="settings-note">El pago se gestiona con Stripe. Puedes cambiar de plan o administrar tu suscripción, método de pago y facturas.</p>
              {error ? <span className="settings-status is-error" role="alert">{error}</span> : null}
              <div className="settings-plan-options">
                {(billingConfig.plans || []).map(plan => (
                  <button
                    key={plan}
                    type="button"
                    className="settings-secondary"
                    onClick={() => billingConfig?.hasSubscription ? openBillingPortal() : startCheckout(plan)}
                    disabled={busy || currentPlan === plan}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {currentPlan === plan ? `${PLAN_LABELS[plan] || plan} (actual)` : `${PLAN_LABELS[plan] || plan} · ${PLAN_PRICES[plan] || 'Consultar'}`}
                  </button>
                ))}
              </div>
              <div className="settings-plan-actions">
                <button type="button" className="settings-primary" onClick={openBillingPortal} disabled={busy}><RiBankCardLine /> {busy ? 'Abriendo…' : 'Gestionar suscripción'}</button>
              </div>
            </>
          ) : (
            <>
              <p className="settings-note">El pago autogestionado se activa al configurar Stripe en el servidor. Mientras tanto, escribe al equipo para cambiar de plan o ampliar límites.</p>
              <div className="settings-plan-actions">
                <a className="settings-primary" href="mailto:soporte@vendrava.app?subject=Cambio%20de%20plan"><RiMailSendLine /> Contactar para cambiar de plan</a>
              </div>
            </>
          )}
        </article>

        <article className="settings-card">
          <header>
            <span className="settings-card-icon"><RiBarChartLine /></span>
            <div><h2>Uso del plan</h2><p>Acumulado total de la organización.</p></div>
          </header>
          <div>
            <Metric label="Minutos de llamada este mes" value={usage ? `${usage.usage.call_minutes.toLocaleString('es-ES')} / ${usage.limits.call_minutes.toLocaleString('es-ES')}` : '—'} />
            <Metric label="Emails enviados este mes" value={usage ? `${usage.usage.emails_sent.toLocaleString('es-ES')} / ${usage.limits.emails_sent.toLocaleString('es-ES')}` : '—'} />
            <Metric label="Agentes IA" value={agentCount !== null ? String(agentCount) : '—'} />
            <Metric label="Usuarios" value={stats?.userCount != null ? String(stats.userCount) : '—'} />
          </div>
          <p className="settings-note">Las cuotas mensuales se reinician el día 1 en UTC. El uso adicional no se cobra automáticamente: al llegar al límite se detiene hasta ampliar el plan.</p>
        </article>

        {platformMetrics ? (
          <article className="settings-card settings-card--wide">
            <header>
              <span className="settings-card-icon"><RiBarChartLine /></span>
              <div><h2>Plataforma abierta · últimos 30 días</h2><p>Consumo facturado, coste de proveedores y margen.</p></div>
            </header>
            <div>
              <Metric label="Facturado por consumo" value={formatCents(platformMetrics.margin?.totals?.priceCents)} />
              <Metric label="Coste de proveedores" value={formatCents(platformMetrics.margin?.totals?.costCents)} />
              <Metric label="Margen de consumo" value={formatCents(platformMetrics.margin?.totals?.marginCents)} />
              <Metric label="Ahorro estimado por routing" value={formatCents(platformMetrics.routing?.savingsCents)} />
              <Metric label="Microapps esta semana" value={String(platformMetrics.microapps?.weeklyRuns ?? 0)} />
              <Metric label="Flows con ≥2 capacidades" value={`${Number(platformMetrics.flows?.percentage ?? 0).toFixed(1)} %`} />
            </div>
            {platformMetrics.margin?.byProvider?.length > 0 ? (
              <p className="settings-note">Por proveedor: {platformMetrics.margin.byProvider.map(row => `${row.provider} ${formatCents(row.marginCents)}`).join(' · ')}</p>
            ) : null}
          </article>
        ) : null}

        <article className="settings-card settings-card--wide">
          <header>
            <span className="settings-card-icon is-success"><RiMailSendLine /></span>
            <div><h2>Soporte</h2><p>Para facturas, límites o cualquier duda sobre el plan.</p></div>
          </header>
          <div className="settings-plan-actions">
            <a className="settings-secondary" href="mailto:soporte@vendrava.app">soporte@vendrava.app</a>
          </div>
        </article>
      </div>
    </section>
  )
}

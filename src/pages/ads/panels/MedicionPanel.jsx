import { Link } from 'react-router-dom'
import { RiArrowRightLine, RiGoogleLine, RiMetaLine, RiShieldCheckLine } from 'react-icons/ri'
import AdsDataIntegrity from '../../../components/ads/AdsDataIntegrity'
import AdsFunnel from '../../../components/ads/AdsFunnel'
import './ads-panels-core.css'

// Medición: la casa de la confianza en los datos. Antes de pedir confianza en
// una cifra hay que decir si se puede confiar en los datos con los que se
// calculó (ads.md §4.2), por eso la banda de integridad abre el panel.
// Regla sagrada del dominio: null = «Sin medición», 0 = medido y salió cero.

const CAPI_LABEL = { ready: 'Preparado', sending: 'Enviando', error: 'Con errores', not_configured: 'Sin configurar' }
const CAPI_TONE = { ready: 'ok', sending: 'ok', error: 'bad', not_configured: 'warn' }

// Un dato sin medir no se pinta como cero ni como visto bueno.
function Stat({ label, value, detail, tone }) {
  const missing = value == null
  return <div className={`gs-stat${tone && !missing ? ` is-${tone}` : ''}${missing ? ' ahc-missing' : ''}`}>
    <span>{label}</span>
    <strong>{missing ? 'Sin medición' : value}</strong>
    {detail && <small>{detail}</small>}
  </div>
}

function formatSnapshot(iso) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function MedicionPanel({ overview, plan, ui }) {
  const data = overview.overview
  const account = data?.account
  const quality = data?.dataQuality
  const metaConnected = Boolean(account?.connected)
  const campaigns = data?.campaigns ?? []
  const matureDays = data?.funnelPeriodDays ?? 30

  // Misma lectura de cohortes que en Resumen: una campaña joven sin ventas
  // todavía no dice nada (ads.md §4.7).
  const immatureCount = campaigns.filter(c => c.economics && c.economics.cohortStatus !== 'mature').length
  const cohortSummary = immatureCount > 0
    ? `${immatureCount === 1 ? 'Una campaña tiene' : `${immatureCount} campañas tienen`} la cohorte sin madurar: su falta de ventas todavía no significa nada.`
    : null

  const capi = quality?.capi
  const capiDetail = capi && capi.total > 0
    ? (capi.failed > 0 ? `${capi.failed} con error de ${capi.total}` : capi.sent > 0 ? `${capi.sent} señales enviadas` : capi.skippedNoConsent > 0 ? `${capi.skippedNoConsent} sin consentimiento` : null)
    : null

  return <div className="gs-stack">
    {/* Estar conectado no equivale a estar conectado bien (ads.md §4.1): si el
        token existe pero no permite leer Insights o enviar CAPI, la banda lo
        dice en vez de mostrar un visto bueno. */}
    {quality
      ? <AdsDataIntegrity account={account} dataQuality={quality} onSync={overview.refreshDataQuality} syncing={overview.refreshingQuality} />
      : <p className="gs-empty-inline">Todavía no hay diagnóstico de integridad: conecta Meta para poder ejecutarlo.</p>}

    {/* Canales: los dos que existen de verdad. Google Ads está en vista previa
        y se dice tal cual, sin fingir una conexión. */}
    <div className="gs-cols-even">
      <section className="gs-panel">
        <div className="gs-panel-head">
          <div>
            <h2><span className="gs-panel-icon"><RiMetaLine /></span> Meta Ads</h2>
            <p>Facebook e Instagram, con campañas y conversiones sincronizadas.</p>
          </div>
          <span className={`gs-pill ${metaConnected ? 'tone-ok' : 'tone-warn'}`}>{metaConnected ? 'Conectado' : 'Pendiente de conectar'}</span>
        </div>
        <div className="gs-panel-body">
          <p className="gs-muted">{metaConnected ? `Cuenta ${account.metaAdAccountId}` : 'Publica campañas y recibe leads desde Meta.'}</p>
          <Link to="/captacion/conectar" className="gs-button">{metaConnected ? 'Gestionar cuenta' : 'Conectar Meta'} <RiArrowRightLine /></Link>
        </div>
      </section>
      <section className="gs-panel is-dashed">
        <div className="gs-panel-head">
          <div>
            <h2><span className="gs-panel-icon"><RiGoogleLine /></span> Google Ads</h2>
            <p>Búsqueda, Performance Max y campañas orientadas a intención.</p>
          </div>
          <span className="gs-pill">Vista previa</span>
        </div>
        <div className="gs-panel-body">
          <p className="gs-muted">Vista de producto · Search y Performance Max preparados para esta sección.</p>
          <button type="button" className="gs-button" onClick={() => ui.showNotice('La conexión de Google Ads se añadirá en la siguiente fase. Esta vista ya queda preparada.')}>Explorar vista previa <RiArrowRightLine /></button>
        </div>
      </section>
    </div>

    {/* Estado de la señal de vuelta: píxel, CAPI, atribución y consentimiento.
        Cada casilla dice lo que se midió; lo no medido queda como tal. */}
    {quality && <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2><span className="gs-panel-icon"><RiShieldCheckLine /></span> Señal de vuelta: CAPI y píxel</h2>
          <p>La señal que Vendrava devuelve a Meta y la cobertura con la que puede atribuir cada lead a su anuncio.</p>
        </div>
      </div>
      <div className="gs-panel-body">
        <div className="gs-stat-grid">
          <Stat label="Conversions API" value={CAPI_LABEL[quality.capiStatus] ?? null} detail={capiDetail} tone={CAPI_TONE[quality.capiStatus]} />
          <Stat label="Atribución" value={quality.attributionCoveragePct == null ? null : `${quality.attributionCoveragePct} %`} detail={quality.adLevelCoveragePct == null ? 'hasta campaña' : `anuncio ${quality.adLevelCoveragePct} %`} tone={quality.attributionCoveragePct == null ? null : quality.attributionCoveragePct >= 90 ? 'ok' : quality.attributionCoveragePct >= 70 ? 'warn' : 'bad'} />
          <Stat label="Duplicados" value={quality.duplicateRatePct == null ? null : `${quality.duplicateRatePct} %`} detail="eventos repetidos detectados" tone={quality.duplicateRatePct == null ? null : quality.duplicateRatePct <= 5 ? 'ok' : 'warn'} />
          <Stat label="Consentimiento" value={quality.consentCoveragePct == null ? null : `${quality.consentCoveragePct} %`} detail="leads con consentimiento registrado" tone={quality.consentCoveragePct == null ? null : quality.consentCoveragePct >= 90 ? 'ok' : 'warn'} />
          <Stat label="Último snapshot" value={formatSnapshot(quality.lastSnapshotAt)} detail={quality.status === 'stale' ? 'datos obsoletos' : null} tone={quality.status === 'stale' ? 'bad' : null} />
        </div>
        {/* Lo que la calidad del dato bloquea se dice en claro: métricas
            profundas y automatización no operan sobre datos que no sostienen. */}
        {quality.blocksDeepMetrics && <p className="gs-alert is-error"><RiShieldCheckLine /><span>Las métricas profundas (CPQL, CAC, ROAS real) están bloqueadas hasta reparar la integridad de los datos.</span></p>}
        {quality.blocksAutomation && <p className="gs-alert"><RiShieldCheckLine /><span>Las decisiones automáticas están bloqueadas: ninguna regla actuará mientras la medición siga así.</span></p>}
      </div>
    </section>}

    {/* La casa natural del embudo de medición: aquí con el detalle de hasta
        dónde llega la señal elegible; en Resumen es solo lectura rápida. */}
    <AdsFunnel
      funnel={data?.funnel}
      deepestEligibleSignal={data?.summary?.deepestEligibleSignal}
      eligibilityReason={data?.summary?.eligibilityReason}
      periodDays={matureDays}
      cohortSummary={cohortSummary}
    />

    {/* Los enlaces profundos de atribución (UTM por campaña, reconciliación de
        eventos) viven en el detalle de cada campaña, pestaña Economía. */}
    <p className="gs-note">
      La atribución campaña → lead → venta se consulta en el detalle de cada campaña (pestaña Economía), donde viven los enlaces UTM y la reconciliación de eventos.{' '}
      {plan.selectedId
        ? <Link className="gs-link" to={`/campanas/${plan.selectedId}`}>Abrir la campaña seleccionada <RiArrowRightLine /></Link>
        : 'Selecciona una campaña en Resumen para saltar directamente a su economía.'}
    </p>
  </div>
}

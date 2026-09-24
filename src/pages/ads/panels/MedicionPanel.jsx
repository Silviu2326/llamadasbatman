import { Link } from 'react-router-dom'
import { RiArrowRightLine, RiGoogleLine, RiMetaLine, RiShieldCheckLine } from 'react-icons/ri'
import AdsDataIntegrity from '../../../components/ads/AdsDataIntegrity'
import AdsFunnel from '../../../components/ads/AdsFunnel'
import { localeCode } from '../../../i18n'
import './ads-panels-core.css'

// Medición: la casa de la confianza en los datos. Antes de pedir confianza en
// una cifra hay que decir si se puede confiar en los datos con los que se
// calculó (ads.md §4.2), por eso la banda de integridad abre el panel.
// Regla sagrada del dominio: null = «Sin medición», 0 = medido y salió cero.

const CAPI_STATES = ['ready', 'sending', 'error', 'not_configured']
const CAPI_TONE = { ready: 'ok', sending: 'ok', error: 'bad', not_configured: 'warn' }

// Un dato sin medir no se pinta como cero ni como visto bueno.
function Stat({ label, value, detail, tone, missingLabel }) {
  const missing = value == null
  return <div className={`gs-stat${tone && !missing ? ` is-${tone}` : ''}${missing ? ' ahc-missing' : ''}`}>
    <span>{label}</span>
    <strong>{missing ? missingLabel : value}</strong>
    {detail && <small>{detail}</small>}
  </div>
}

function formatSnapshot(iso, locale) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(localeCode(locale), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function MedicionPanel({ overview, plan, ui }) {
  const { t, locale } = ui
  const noMeasurement = t('ads.common.noMeasurement')
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
    ? (immatureCount === 1 ? t('ads.resumen.cohortOne') : t('ads.resumen.cohortMany', { count: immatureCount }))
    : null

  const capi = quality?.capi
  const capiDetail = capi && capi.total > 0
    ? (capi.failed > 0 ? t('ads.medicion.capiFailed', { failed: capi.failed, total: capi.total }) : capi.sent > 0 ? t('ads.medicion.capiSent', { count: capi.sent }) : capi.skippedNoConsent > 0 ? t('ads.medicion.capiNoConsent', { count: capi.skippedNoConsent }) : null)
    : null

  return <div className="gs-stack">
    {/* Estar conectado no equivale a estar conectado bien (ads.md §4.1): si el
        token existe pero no permite leer Insights o enviar CAPI, la banda lo
        dice en vez de mostrar un visto bueno. */}
    {quality
      ? <AdsDataIntegrity account={account} dataQuality={quality} onSync={overview.refreshDataQuality} syncing={overview.refreshingQuality} />
      : <p className="gs-empty-inline">{t('ads.medicion.noDiagnosis')}</p>}

    {/* Canales: los dos que existen de verdad. Google Ads está en vista previa
        y se dice tal cual, sin fingir una conexión. */}
    <div className="gs-cols-even">
      <section className="gs-panel">
        <div className="gs-panel-head">
          <div>
            <h2><span className="gs-panel-icon"><RiMetaLine /></span> Meta Ads</h2>
            <p>{t('ads.medicion.metaText')}</p>
          </div>
          <span className={`gs-pill ${metaConnected ? 'tone-ok' : 'tone-warn'}`}>{metaConnected ? t('ads.medicion.connected') : t('ads.medicion.pending')}</span>
        </div>
        <div className="gs-panel-body">
          <p className="gs-muted">{metaConnected ? t('ads.medicion.accountLine', { id: account.metaAdAccountId }) : t('ads.medicion.metaPitch')}</p>
          <Link to="/captacion/conectar" className="gs-button">{metaConnected ? t('ads.medicion.manage') : t('ads.medicion.connect')} <RiArrowRightLine /></Link>
        </div>
      </section>
      <section className="gs-panel is-dashed">
        <div className="gs-panel-head">
          <div>
            <h2><span className="gs-panel-icon"><RiGoogleLine /></span> Google Ads</h2>
            <p>{t('ads.medicion.googleText')}</p>
          </div>
          <span className="gs-pill">{t('ads.medicion.preview')}</span>
        </div>
        <div className="gs-panel-body">
          <p className="gs-muted">{t('ads.medicion.googlePreviewText')}</p>
          <button type="button" className="gs-button" onClick={() => ui.showNotice(t('ads.medicion.googleNotice'))}>{t('ads.medicion.explorePreview')} <RiArrowRightLine /></button>
        </div>
      </section>
    </div>

    {/* Estado de la señal de vuelta: píxel, CAPI, atribución y consentimiento.
        Cada casilla dice lo que se midió; lo no medido queda como tal. */}
    {quality && <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2><span className="gs-panel-icon"><RiShieldCheckLine /></span> {t('ads.medicion.signalTitle')}</h2>
          <p>{t('ads.medicion.signalText')}</p>
        </div>
      </div>
      <div className="gs-panel-body">
        <div className="gs-stat-grid">
          <Stat missingLabel={noMeasurement} label={t('ads.medicion.capiLabel')} value={CAPI_STATES.includes(quality.capiStatus) ? t(`ads.medicion.capi.${quality.capiStatus}`) : null} detail={capiDetail} tone={CAPI_TONE[quality.capiStatus]} />
          <Stat missingLabel={noMeasurement} label={t('ads.medicion.attribution')} value={quality.attributionCoveragePct == null ? null : `${quality.attributionCoveragePct} %`} detail={quality.adLevelCoveragePct == null ? t('ads.medicion.upToCampaign') : t('ads.medicion.adLevel', { pct: quality.adLevelCoveragePct })} tone={quality.attributionCoveragePct == null ? null : quality.attributionCoveragePct >= 90 ? 'ok' : quality.attributionCoveragePct >= 70 ? 'warn' : 'bad'} />
          <Stat missingLabel={noMeasurement} label={t('ads.medicion.duplicates')} value={quality.duplicateRatePct == null ? null : `${quality.duplicateRatePct} %`} detail={t('ads.medicion.duplicatesDetail')} tone={quality.duplicateRatePct == null ? null : quality.duplicateRatePct <= 5 ? 'ok' : 'warn'} />
          <Stat missingLabel={noMeasurement} label={t('ads.medicion.consent')} value={quality.consentCoveragePct == null ? null : `${quality.consentCoveragePct} %`} detail={t('ads.medicion.consentDetail')} tone={quality.consentCoveragePct == null ? null : quality.consentCoveragePct >= 90 ? 'ok' : 'warn'} />
          <Stat missingLabel={noMeasurement} label={t('ads.medicion.lastSnapshot')} value={formatSnapshot(quality.lastSnapshotAt, locale)} detail={quality.status === 'stale' ? t('ads.medicion.stale') : null} tone={quality.status === 'stale' ? 'bad' : null} />
        </div>
        {/* Lo que la calidad del dato bloquea se dice en claro: métricas
            profundas y automatización no operan sobre datos que no sostienen. */}
        {quality.blocksDeepMetrics && <p className="gs-alert is-error"><RiShieldCheckLine /><span>{t('ads.medicion.deepBlocked')}</span></p>}
        {quality.blocksAutomation && <p className="gs-alert"><RiShieldCheckLine /><span>{t('ads.medicion.automationBlocked')}</span></p>}
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
      {t('ads.medicion.note')}{' '}
      {plan.selectedId
        ? <Link className="gs-link" to={`/campanas/${plan.selectedId}`}>{t('ads.medicion.openCampaign')} <RiArrowRightLine /></Link>
        : t('ads.medicion.selectCampaign')}
    </p>
  </div>
}

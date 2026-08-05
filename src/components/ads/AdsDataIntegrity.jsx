import { RiAlertLine, RiCheckboxCircleLine, RiErrorWarningLine, RiQuestionLine, RiShieldCheckLine } from 'react-icons/ri'

// Banda de integridad de docs/xarly/ads.md §4.2. Va antes de los KPI a
// propósito: la página no puede pedir confianza en una cifra sin haber dicho
// primero si puede confiar en los datos con los que la calculó.

const STATUS_COPY = {
  ready: {
    label: 'Datos listos',
    detail: 'Las métricas y las recomendaciones se pueden usar con normalidad.',
    tone: 'ok',
    Icon: RiShieldCheckLine,
  },
  partial: {
    label: 'Datos parciales',
    detail: 'Se muestran resultados, pero con menos confianza: falta parte de la información.',
    tone: 'warn',
    Icon: RiAlertLine,
  },
  stale: {
    label: 'Datos obsoletos',
    detail: 'Los últimos datos de Meta son antiguos. Las decisiones automáticas quedan bloqueadas.',
    tone: 'warn',
    Icon: RiErrorWarningLine,
  },
  unreliable: {
    label: 'Datos no fiables',
    detail: 'No se pueden comparar campañas hasta reparar la integridad.',
    tone: 'bad',
    Icon: RiErrorWarningLine,
  },
}

/** `null` es "sin medición" y nunca debe pintarse como un cero tranquilizador. */
function measure(value, format) {
  if (value == null) return { text: 'Sin medición', tone: 'unknown' }
  return { text: format(value), tone: null }
}

function formatDelay(minutes) {
  if (minutes == null) return 'Sin medición'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} días`
}

function permissionsCheck(account, dataQuality) {
  if (!account?.connected) return { value: 'Sin conectar', tone: 'bad' }
  if (dataQuality.status === 'unreliable' && dataQuality.accountStatus === 'revoked') {
    return { value: 'Revocado', tone: 'bad' }
  }
  const granted = Object.values(account.permissions ?? {}).filter(Boolean).length
  const total = Object.keys(account.permissions ?? {}).length
  if (total > 0 && granted === total && !dataQuality.missingAssets?.length) {
    return { value: 'Válido', tone: 'ok' }
  }
  return { value: `Incompleto · ${granted}/${total}`, tone: 'warn' }
}

function attributionCheck(dataQuality) {
  const { attributionCoveragePct, adLevelCoveragePct } = dataQuality
  if (attributionCoveragePct == null) return { value: 'Sin medición', tone: 'unknown' }
  const adLevel = adLevelCoveragePct == null ? 'anuncio sin medir' : `anuncio ${adLevelCoveragePct} %`
  return {
    value: `Campaña ${attributionCoveragePct} % · ${adLevel}`,
    tone: attributionCoveragePct >= 90 ? 'ok' : attributionCoveragePct >= 70 ? 'warn' : 'bad',
  }
}

const CAPI_COPY = {
  ready: { value: 'Preparado', tone: 'ok' },
  sending: { value: 'Enviando', tone: 'ok' },
  error: { value: 'Con errores', tone: 'bad' },
  not_configured: { value: 'Sin configurar', tone: 'warn' },
  unknown: { value: 'Sin medición', tone: 'unknown' },
}

/**
 * El estado de CAPI sale de entregas reales, no de si hay un pixel guardado.
 * Cuando hay envíos se muestra el recuento: "preparado" con cero señales
 * enviadas es una media verdad.
 */
function capiCheck(dataQuality) {
  const base = CAPI_COPY[dataQuality.capiStatus] ?? CAPI_COPY.unknown
  const capi = dataQuality.capi
  if (!capi || capi.total === 0) return base
  if (capi.failed > 0) return { value: `${capi.failed} con error de ${capi.total}`, tone: 'bad' }
  if (capi.sent > 0) return { value: `${capi.sent} enviadas`, tone: 'ok' }
  if (capi.skippedNoConsent > 0) return { value: `${capi.skippedNoConsent} sin consentimiento`, tone: 'warn' }
  return base
}

export default function AdsDataIntegrity({ account, dataQuality, onSync, syncing }) {
  if (!dataQuality) return null

  const status = STATUS_COPY[dataQuality.status] ?? STATUS_COPY.partial
  const { Icon } = status

  const freshness = dataQuality.lastSnapshotAt
    ? { value: formatDelay(dataQuality.snapshotDelayMinutes), tone: dataQuality.status === 'stale' ? 'bad' : null }
    : { value: 'Sin datos todavía', tone: 'unknown' }

  const consent = measure(dataQuality.consentCoveragePct, value => `${value} % con consentimiento`)
  const duplicates = measure(dataQuality.duplicateRatePct, value => `${value} % duplicados`)

  const checks = [
    { key: 'permissions', label: 'Permisos y activos', ...permissionsCheck(account, dataQuality) },
    {
      key: 'identifiers',
      label: 'Identificadores',
      value: dataQuality.adLevelCoveragePct == null ? 'Hasta campaña' : 'Hasta anuncio',
      tone: dataQuality.adLevelCoveragePct == null ? 'warn' : 'ok',
    },
    { key: 'freshness', label: 'Frescura', value: freshness.value, tone: freshness.tone },
    { key: 'attribution', label: 'Atribución', ...attributionCheck(dataQuality) },
    { key: 'duplicates', label: 'Duplicados', value: duplicates.text, tone: duplicates.tone },
    { key: 'consent', label: 'Consentimiento', value: consent.text, tone: consent.tone },
    { key: 'capi', label: 'Conversions API', ...capiCheck(dataQuality) },
    {
      key: 'locale',
      label: 'Moneda y zona horaria',
      value: `${dataQuality.currency ?? 'EUR'} · ${dataQuality.timezone ?? 'Europe/Madrid'}`,
      tone: null,
    },
  ]

  const issues = dataQuality.issues ?? []

  return (
    <section className={`ads-integrity is-${status.tone}`} aria-label="Integridad de los datos de Ads">
      <header className="ads-integrity-head">
        <span className="ads-integrity-icon"><Icon /></span>
        <div>
          <h2>{status.label}</h2>
          <p>{status.detail}</p>
        </div>
        {onSync && (
          <button className="ads-action secondary" onClick={onSync} disabled={syncing}>
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        )}
      </header>

      <dl className="ads-integrity-grid">
        {checks.map(check => (
          <div key={check.key} className={check.tone ? `is-${check.tone}` : ''}>
            <dt>{check.label}</dt>
            <dd>{check.value}</dd>
          </div>
        ))}
      </dl>

      {issues.length > 0 && (
        <ul className="ads-integrity-issues">
          {issues.map(issue => (
            <li key={issue.code} className={`is-${issue.severity}`}>
              {issue.severity === 'info' ? <RiQuestionLine /> : issue.severity === 'critical' ? <RiErrorWarningLine /> : <RiAlertLine />}
              <span>{issue.message}</span>
              {issue.action && <em>{issue.action}</em>}
            </li>
          ))}
        </ul>
      )}

      {issues.length === 0 && dataQuality.status === 'ready' && (
        <p className="ads-integrity-clear"><RiCheckboxCircleLine /> Sin incidencias detectadas en la última comprobación.</p>
      )}
    </section>
  )
}

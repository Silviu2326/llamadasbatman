import { useState } from 'react'
import { RiAlertLine, RiArrowGoBackLine, RiLockLine, RiPlayCircleLine, RiShieldCheckLine } from 'react-icons/ri'

// Acciones aprobadas pendientes de ejecutar — Fase 4 de docs/xarly/ads.md.
//
// La confirmación no es un "¿estás seguro?": enseña alcance, impacto y lo que
// NO se recupera aunque se compense. Una acción es compensable, no reversible,
// y esa diferencia tiene que verse antes de pulsar, no después.

const KIND_LABEL = {
  pause_ad_set: 'Pausar el ad set',
  resume_ad_set: 'Reactivar el ad set',
  set_budget: 'Cambiar el presupuesto',
  set_max_cpl: 'Cambiar el límite de CPL',
}

const SCOPE_LABEL = { ad: 'un anuncio', ad_set: 'un ad set', campaign: 'una campaña completa' }

function ActionCard({ action, onExecute, onCompensate, busyId }) {
  const [confirming, setConfirming] = useState(false)
  const busy = busyId === action.id
  const blocked = !action.executable
  const failed = action.status === 'failed'

  return (
    <article className={`ads-pending-action${blocked ? ' is-blocked' : ''}${failed ? ' is-failed' : ''}`}>
      <header>
        <strong>{KIND_LABEL[action.kind] ?? action.kind}</strong>
        {action.campaign?.name && <span>{action.campaign.name}</span>}
      </header>
      <p className="ads-pending-origin">Aprobada a raíz de: “{action.decision?.title}”</p>

      <dl className="ads-pending-meta">
        <div><dt>Alcance</dt><dd>{SCOPE_LABEL[action.scope] ?? action.scope}</dd></div>
        <div><dt>Estado</dt><dd>{failed ? 'Falló' : blocked ? 'Bloqueada' : 'Lista'}</dd></div>
        <div><dt>Modo</dt><dd>{action.mode === 'live' ? 'activo' : 'sombra'}</dd></div>
      </dl>

      {blocked && (
        <p className="ads-pending-blocked"><RiLockLine /> {action.blockedReason}</p>
      )}
      {failed && action.errorCode && (
        <p className="ads-pending-blocked"><RiAlertLine /> Último intento fallido: {action.errorCode}</p>
      )}

      {!confirming ? (
        <div className="ads-pending-controls">
          <button
            className="ads-action primary"
            disabled={busy || blocked}
            title={blocked ? action.blockedReason : undefined}
            onClick={() => setConfirming(true)}
          >
            <RiPlayCircleLine /> {failed ? 'Reintentar' : 'Ejecutar'}
          </button>
        </div>
      ) : (
        <div className="ads-pending-confirm">
          <strong>Vas a {(KIND_LABEL[action.kind] ?? action.kind).toLowerCase()} en {SCOPE_LABEL[action.scope] ?? action.scope}.</strong>
          {action.compensationPayload ? (
            <p className="ads-pending-compensable"><RiShieldCheckLine /> Se puede deshacer: {KIND_LABEL[action.compensationPayload.kind] ?? 'acción compensatoria disponible'}.</p>
          ) : (
            <p className="ads-pending-compensable is-none"><RiAlertLine /> Esta acción no tiene compensación disponible.</p>
          )}
          {action.irreversibleEffects?.length > 0 && (
            <>
              <span className="ads-pending-irreversible-title">Aunque la deshagas, esto no se recupera:</span>
              <ul className="ads-pending-irreversible">
                {action.irreversibleEffects.map(effect => <li key={effect}>{effect}</li>)}
              </ul>
            </>
          )}
          <div className="ads-pending-controls">
            <button className="ads-detail-link" onClick={() => setConfirming(false)}>Cancelar</button>
            <button className="ads-action primary" disabled={busy} onClick={() => onExecute(action.id)}>
              {busy ? 'Ejecutando…' : 'Confirmar y ejecutar'}
            </button>
          </div>
        </div>
      )}

      {action.status === 'executed' && onCompensate && (
        <button className="ads-detail-link" disabled={busy} onClick={() => onCompensate(action.id)}>
          <RiArrowGoBackLine /> Deshacer
        </button>
      )}
    </article>
  )
}

export default function AdsPendingActions({ actions, onExecute, onCompensate, busyId }) {
  if (!actions?.length) return null

  return (
    <section className="ads-pending">
      <div className="ads-section-head">
        <div>
          <h2>Acciones aprobadas</h2>
          <p>Aprobadas por una persona y pendientes de ejecutar. Los guardarraíles se vuelven a comprobar al pulsar.</p>
        </div>
        <span className="ads-funnel-signal">{actions.length} pendiente{actions.length === 1 ? '' : 's'}</span>
      </div>
      <div className="ads-pending-list">
        {actions.map(action => (
          <ActionCard key={action.id} action={action} onExecute={onExecute} onCompensate={onCompensate} busyId={busyId} />
        ))}
      </div>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiMetaLine, RiLink, RiLinkUnlink, RiMoneyDollarCircleLine,
  RiCheckLine, RiAlertLine, RiCodeBoxLine,
} from 'react-icons/ri'
import '../dashboard.css'
import { getLocale, localeCode, useI18n } from '../i18n'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import AdsDataIntegrity from '../components/ads/AdsDataIntegrity'
import '../pages/ads.css'

export default function MetaAccountPage() {
  const { t, locale } = useI18n()
  const [searchParams] = useSearchParams()
  const [account, setAccount] = useState(null)
  // Sin esto, un 403/5xx era indistinguible de "no hay cuenta conectada".
  const [loadStatus, setLoadStatus] = useState('')
  const [loadMessage, setLoadMessage] = useState('')
  const [showDisconnect, setShowDisconnect] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [budget, setBudget] = useState('')
  const [pixelId, setPixelId] = useState('')
  const [savingPixel, setSavingPixel] = useState(false)
  const [message, setMessage] = useState('')
  // La conexión no se juzga por "hay token", sino por si de verdad permite leer
  // Insights, recibir leads y enviar CAPI (ads.md §4.1). Ese diagnóstico ya
  // existe; aquí se muestra en la pantalla donde se repara.
  const [quality, setQuality] = useState(null)
  const [checking, setChecking] = useState(false)
  const [stopping, setStopping] = useState(false)

  const oauthStatus = searchParams.get('status')

  useEffect(() => {
    if (oauthStatus === 'connected') setMessage(t('meta.connected'))
    if (oauthStatus === 'error') setMessage(t('meta.connectError'))
  }, [oauthStatus, t])

  useEffect(() => {
    loadAccount()
    loadQuality()
  }, [])

  async function loadQuality() {
    try {
      const res = await apiFetch('/api/ads/data-quality')
      setQuality(res.ok ? await res.json() : null)
    } catch {
      setQuality(null)
    }
  }

  async function recheck() {
    setChecking(true)
    try {
      await apiFetch('/api/ads/data-quality/refresh', { method: 'POST' })
      await Promise.all([loadAccount(), loadQuality()])
    } finally {
      setChecking(false)
    }
  }

  // Parar la autonomía desde la cuenta, como pide la Fase 5: el freno tiene que
  // estar donde alguien lo busca cuando algo va mal, no solo en /ads.
  async function toggleAutonomy() {
    if (!quality) return
    const engaged = quality.policy?.killSwitch === 'engaged'
    setStopping(true)
    try {
      const res = await apiFetch('/api/ads/policy/stop', {
        method: 'POST',
        body: JSON.stringify(engaged ? { resume: true } : { reason: 'Parada desde la cuenta de Meta' }),
      })
      if (!res.ok) throw new Error()
      setMessage(engaged ? 'Autonomía reanudada.' : 'Autonomía parada: Vendrava no ejecutará ninguna acción.')
      await loadQuality()
    } catch {
      setMessage('No se pudo cambiar el estado de la autonomía.')
    } finally {
      setStopping(false)
    }
  }

  async function loadAccount() {
    try {
      const res = await apiFetch('/api/meta/accounts')
      if (!res.ok) {
        const gate = await readPlanGate(res)
        setAccount(null)
        setLoadStatus(gate ? 'plan' : 'error')
        setLoadMessage(gate
          ? planGateMessage(gate, locale)
          : (locale === 'en'
            ? 'We could not check the connection with Meta. This does not mean the account is disconnected.'
            : 'No se pudo comprobar la conexión con Meta. Esto no significa que la cuenta esté desconectada.'))
        return
      }
      const data = await res.json()
      setLoadStatus('')
      setLoadMessage('')
      setAccount(data)
      if (data?.dailyBudgetCapCents != null) setBudget(String(data.dailyBudgetCapCents / 100))
      setPixelId(data?.metaPixelId || '')
    } catch {
      setAccount(null)
      setLoadStatus('error')
      setLoadMessage(locale === 'en'
        ? 'We could not check the connection with Meta. This does not mean the account is disconnected.'
        : 'No se pudo comprobar la conexión con Meta. Esto no significa que la cuenta esté desconectada.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect() {
    const res = await apiFetch('/api/meta/accounts/oauth/start-url')
    if (!res.ok) return setMessage(t('meta.oauthError'))
    const { url } = await res.json()
    window.location.href = url
  }

  async function saveBudget() {
    if (!account) return
    const cents = Math.round(parseFloat(budget) * 100)
    if (Number.isNaN(cents) || cents < 0) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/meta/accounts/${account.id}/budget-cap`, {
        method: 'PUT',
        body: JSON.stringify({ dailyBudgetCapCents: cents }),
      })
      if (!res.ok) throw new Error()
      setMessage(t('meta.budgetSaved'))
      await loadAccount()
    } catch {
      setMessage(t('meta.budgetSaveError'))
    } finally {
      setSaving(false)
    }
  }

  async function savePixelId() {
    if (!account) return
    setSavingPixel(true)
    try {
      const res = await apiFetch(`/api/meta/accounts/${account.id}/pixel-id`, {
        method: 'PUT',
        body: JSON.stringify({ metaPixelId: pixelId.trim() }),
      })
      if (!res.ok) throw new Error()
      setMessage(t('meta.pixelSaved'))
      await loadAccount()
    } catch {
      setMessage(t('meta.pixelSaveError'))
    } finally {
      setSavingPixel(false)
    }
  }

  async function handleDisconnect() {
    if (!account) return
    setShowDisconnect(false)
    try {
      const res = await apiFetch(`/api/meta/accounts/${account.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setAccount(null)
      setBudget('')
      setMessage(t('meta.disconnected'))
    } catch {
      setMessage(t('meta.disconnectError'))
    }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 14, background: 'var(--bg)' }}>
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: '26px clamp(12px,4vw,32px) 40px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, minWidth: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #1877f2, #0c4a9e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RiMetaLine style={{ width: 22, height: 22, color: '#fff' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-strong)' }}>{t('meta.title')}</h1>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)' }}>{t('meta.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
          padding: '10px 14px', borderRadius: 10,
          background: message.includes('No se pudo') || message.includes('desconectada') ? '#ef444415' : '#10b98115',
          border: message.includes('No se pudo') || message.includes('desconectada') ? '1px solid #ef444440' : '1px solid #10b98140',
          color: message.includes('No se pudo') || message.includes('desconectada') ? 'var(--danger)' : 'var(--success)',
          fontSize: 13,
        }}>
          {message.includes('No se pudo') || message.includes('desconectada') ? <RiAlertLine style={{ width: 16, height: 16 }} /> : <RiCheckLine style={{ width: 16, height: 16 }} />}
          {message}
        </div>
      )}

      {loadStatus && (
        <DataStatusBanner
          status={loadStatus}
          message={loadMessage}
          onRetry={loadStatus === 'error' ? () => { setLoading(true); loadAccount() } : undefined}
        />
      )}

      {!account ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '28px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--muted)' }}>
            {loadStatus ? loadMessage : t('meta.noAccount')}
          </p>
          {loadStatus === 'plan' ? null : (
            <button
              onClick={loadStatus === 'error' ? () => { setLoading(true); loadAccount() } : handleConnect}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(90deg, #1877f2, #0c4a9e)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <RiLink style={{ width: 16, height: 16 }} /> {loadStatus === 'error' ? (locale === 'en' ? 'Check again' : 'Volver a comprobar') : t('meta.connectAccount')}
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 'clamp(14px,4vw,24px)', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 14 }}>
            {[
              { label: t('meta.accountId'), value: account.metaAdAccountId },
              { label: t('meta.page'), value: account.metaPageId || '—' },
              { label: t('meta.status'), value: account.status },
              { label: t('meta.connectedAt'), value: new Date(account.connectedAt).toLocaleDateString(localeCode(getLocale())) },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', minWidth: 0 }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', fontWeight: 600, overflowWrap: 'anywhere' }}>{item.value}</p>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <RiMoneyDollarCircleLine style={{ width: 18, height: 18, color: 'var(--success)' }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{t('meta.dailyCap')}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                placeholder={t('meta.noCap')}
                style={{ flex: '1 1 140px', minWidth: 0, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={saveBudget}
                disabled={saving}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: saving ? 'var(--surface-3)' : 'var(--success-bg)', color: saving ? 'var(--muted)' : 'var(--success)',
                  fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                }}
              >
                {saving ? t('common.saving') : t('meta.save')}
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--dim)' }}>{t('meta.dailyCapHint')}</p>
          </div>

          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <RiCodeBoxLine style={{ width: 18, height: 18, color: 'var(--accent-soft)' }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{t('meta.pixelId')}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={pixelId}
                onChange={e => setPixelId(e.target.value)}
                placeholder="123456789012345"
                style={{ flex: '1 1 140px', minWidth: 0, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={savePixelId}
                disabled={savingPixel}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: savingPixel ? 'var(--surface-3)' : 'var(--accent-deep)', color: savingPixel ? 'var(--muted)' : 'var(--on-accent)',
                  fontSize: 13, fontWeight: 600, cursor: savingPixel ? 'default' : 'pointer',
                }}
              >
                {savingPixel ? t('common.saving') : t('meta.save')}
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--dim)' }}>{t('meta.pixelHint')}</p>
          </div>

          {quality && (
            <div className="ads-embed">
              <AdsDataIntegrity
                account={{ connected: true, permissions: { insights: quality.permissionsInsights, leads: quality.permissionsLeads, capi: quality.permissionsCapi } }}
                dataQuality={quality}
                onSync={recheck}
                syncing={checking}
              />
              <section className="ads-autonomy" style={{ marginTop: 12 }}>
                <div className="ads-section-head">
                  <div>
                    <h2>Autonomía de Vendrava</h2>
                    <p>
                      Nivel <b>{quality.policy?.autonomyLevel ?? 'N1'}</b> en modo <b>{quality.policy?.mode ?? 'shadow'}</b>.
                      {quality.policy?.killSwitch === 'engaged'
                        ? ` Parada: ${quality.policy.killSwitchReason ?? 'sin motivo registrado'}.`
                        : ' Ninguna acción llega a Meta sin que alguien la apruebe.'}
                    </p>
                  </div>
                  <button
                    className={`ads-action ${quality.policy?.killSwitch === 'engaged' ? 'primary' : 'secondary'}`}
                    onClick={toggleAutonomy}
                    disabled={stopping}
                  >
                    {quality.policy?.killSwitch === 'engaged' ? 'Reanudar autonomía' : 'Parar autonomía'}
                  </button>
                </div>
              </section>
            </div>
          )}

          <button
            onClick={() => setShowDisconnect(true)}
            style={{
              alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 8, border: '1px solid #ef444440',
              background: '#ef444415', color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RiLinkUnlink style={{ width: 15, height: 15 }} /> {t('meta.disconnect')}
          </button>
        </div>
      )}
      {showDisconnect && <ConfirmDialog
        title="Desconectar cuenta de Meta"
        message={t('meta.disconnectConfirm')}
        confirmText="Desconectar"
        onConfirm={handleDisconnect}
        onClose={() => setShowDisconnect(false)}
      />}
    </div>
  )
}

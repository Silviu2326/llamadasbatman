import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiMetaLine, RiLink, RiLinkUnlink, RiMoneyDollarCircleLine,
  RiCheckLine, RiAlertLine, RiCodeBoxLine, RiTimeLine, RiPagesLine,
} from 'react-icons/ri'
import '../dashboard.css'
import { localeCode, useI18n } from '../i18n'
import { planGateMessage, readPlanGate } from '../lib/planGate'
import DataStatusBanner from '../components/ui/DataStatusBanner'
import PageLoadingState from '../components/ui/PageLoadingState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import AdsDataIntegrity from '../components/ads/AdsDataIntegrity'
import '../pages/ads.css'

const PIXEL_ID_PATTERN = /^\d{5,30}$/
const EXPIRY_WARNING_DAYS = 7

// Estado de la caducidad del token: null sin fecha; días restantes (puede ser
// negativo) y si toca avisar. Se calcula aquí para que la vista no decida por
// el texto.
function tokenExpiryState(iso) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000)
  return { date, days, expired: days < 0, soon: days >= 0 && days < EXPIRY_WARNING_DAYS }
}

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
  // El aviso lleva su tono explícito ({ kind: 'error' | 'ok', text }): el color
  // no se deduce del texto, que además cambia con el idioma.
  const [message, setMessageState] = useState(null)
  const setMessage = (text, kind = 'ok') => setMessageState(text ? { kind, text } : null)
  // Selector de cuenta publicitaria y página: las opciones se piden a Graph.
  const [options, setOptions] = useState(null)
  const [optionsStatus, setOptionsStatus] = useState('idle') // idle | loading | ready | error
  const [selectedAdAccount, setSelectedAdAccount] = useState('')
  const [selectedPage, setSelectedPage] = useState('')
  const [applyingSelection, setApplyingSelection] = useState(false)
  // La conexión no se juzga por "hay token", sino por si de verdad permite leer
  // Insights, recibir leads y enviar CAPI (ads.md §4.1). Ese diagnóstico ya
  // existe; aquí se muestra en la pantalla donde se repara.
  const [quality, setQuality] = useState(null)
  const [checking, setChecking] = useState(false)
  const [stopping, setStopping] = useState(false)

  const oauthStatus = searchParams.get('status')

  useEffect(() => {
    if (oauthStatus === 'connected') setMessage(t('meta.connected'))
    if (oauthStatus === 'error') setMessage(t('meta.connectError'), 'error')
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
        body: JSON.stringify(engaged ? { resume: true } : { reason: t('metaConnect.stopReason') }),
      })
      if (!res.ok) throw new Error()
      setMessage(engaged ? t('metaConnect.autonomyResumed') : t('metaConnect.autonomyStopped'))
      await loadQuality()
    } catch {
      setMessage(t('metaConnect.autonomyFailed'), 'error')
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
        setLoadMessage(gate ? planGateMessage(gate, locale) : t('metaConnect.loadError'))
        return
      }
      const data = await res.json()
      setLoadStatus('')
      setLoadMessage('')
      setAccount(data)
      // Sin tope el campo queda vacío: vacío + guardar = quitar el tope (null).
      setBudget(data?.dailyBudgetCapCents != null ? String(data.dailyBudgetCapCents / 100) : '')
      setPixelId(data?.metaPixelId || '')
      if (data) loadOptions()
    } catch {
      setAccount(null)
      setLoadStatus('error')
      setLoadMessage(t('metaConnect.loadError'))
    } finally {
      setLoading(false)
    }
  }

  async function loadOptions() {
    setOptionsStatus('loading')
    try {
      const res = await apiFetch('/api/meta/accounts/options')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setOptions(data)
      setSelectedAdAccount(data?.current?.adAccountId ?? '')
      setSelectedPage(data?.current?.pageId ?? '')
      setOptionsStatus('ready')
    } catch {
      setOptions(null)
      setOptionsStatus('error')
    }
  }

  async function applySelection() {
    if (!account || !selectedAdAccount) return
    setApplyingSelection(true)
    try {
      const res = await apiFetch('/api/meta/accounts/select', {
        method: 'POST',
        body: JSON.stringify({ adAccountId: selectedAdAccount, pageId: selectedPage || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error || '')
      setMessage(t('metaConnect.selectionSaved'))
      await loadAccount()
    } catch (error) {
      setMessage(error?.message || t('metaConnect.selectionError'), 'error')
    } finally {
      setApplyingSelection(false)
    }
  }

  async function handleConnect() {
    const res = await apiFetch('/api/meta/accounts/oauth/start-url')
    if (!res.ok) {
      // 409 META_OAUTH_NOT_CONFIGURED: es configuración pendiente del
      // administrador, no un fallo del OAuth; se explica como tal.
      const body = await res.json().catch(() => ({}))
      const text = body?.code === 'META_OAUTH_NOT_CONFIGURED' ? t('metaConnect.oauthNotConfigured') : (body?.error || t('meta.oauthError'))
      return setMessage(text, 'error')
    }
    const { url } = await res.json()
    window.location.href = url
  }

  async function saveBudget() {
    if (!account) return
    const raw = budget.trim()
    // Campo vacío = quitar el tope (null). El backend exige céntimos enteros ≥ 0.
    const cents = raw === '' ? null : Math.round(Number(raw.replace(',', '.')) * 100)
    if (cents !== null && (!Number.isFinite(cents) || cents < 0)) return setMessage(t('metaConnect.budgetInvalid'), 'error')
    setSaving(true)
    try {
      const res = await apiFetch(`/api/meta/accounts/${account.id}/budget-cap`, {
        method: 'PUT',
        body: JSON.stringify({ dailyBudgetCapCents: cents }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.issues?.[0]?.message || '')
      }
      setMessage(cents === null ? t('metaConnect.capRemoved') : t('meta.budgetSaved'))
      await loadAccount()
    } catch (error) {
      setMessage(error?.message || t('meta.budgetSaveError'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function savePixelId() {
    if (!account) return
    const value = pixelId.trim()
    if (value && !PIXEL_ID_PATTERN.test(value)) return setMessage(t('metaConnect.pixelInvalid'), 'error')
    setSavingPixel(true)
    try {
      const res = await apiFetch(`/api/meta/accounts/${account.id}/pixel-id`, {
        method: 'PUT',
        body: JSON.stringify({ metaPixelId: value || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.issues?.[0]?.message || '')
      }
      setMessage(value ? t('meta.pixelSaved') : t('metaConnect.pixelRemoved'))
      await loadAccount()
    } catch (error) {
      setMessage(error?.message || t('meta.pixelSaveError'), 'error')
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
      setOptions(null)
      setOptionsStatus('idle')
      setMessage(t('meta.disconnected'))
    } catch {
      setMessage(t('meta.disconnectError'), 'error')
    }
  }

  if (loading) return <PageLoadingState label={t('common.loading')} />

  const expiry = account ? tokenExpiryState(account.accessTokenExpiresAt) : null
  const expiryText = !account ? '' : !expiry
    ? t('metaConnect.tokenNoExpiry')
    : t(expiry.expired ? 'metaConnect.tokenExpired' : expiry.soon ? 'metaConnect.tokenExpiresSoon' : 'metaConnect.tokenExpires', {
      date: expiry.date.toLocaleDateString(localeCode(locale)),
      days: Math.max(0, expiry.days),
    })
  const expiryWarns = Boolean(expiry && (expiry.expired || expiry.soon))
  const inputStyle = { flex: '1 1 140px', minWidth: 0, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }

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
        <div role={message.kind === 'error' ? 'alert' : 'status'} style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
          padding: '10px 14px', borderRadius: 10,
          background: message.kind === 'error' ? '#ef444415' : '#10b98115',
          border: message.kind === 'error' ? '1px solid #ef444440' : '1px solid #10b98140',
          color: message.kind === 'error' ? 'var(--danger)' : 'var(--success)',
          fontSize: 13,
        }}>
          {message.kind === 'error' ? <RiAlertLine style={{ width: 16, height: 16 }} /> : <RiCheckLine style={{ width: 16, height: 16 }} />}
          {message.text}
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
              <RiLink style={{ width: 16, height: 16 }} /> {loadStatus === 'error' ? t('metaConnect.checkAgain') : t('meta.connectAccount')}
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
              { label: t('meta.connectedAt'), value: new Date(account.connectedAt).toLocaleDateString(localeCode(locale)) },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', minWidth: 0 }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', fontWeight: 600, overflowWrap: 'anywhere' }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Caducidad del acceso: con menos de 7 días se avisa en tono de
              alerta y se ofrece reconectar; sin fecha se dice tal cual. */}
          <div role={expiryWarns ? 'alert' : undefined} style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            background: expiryWarns ? '#f59e0b15' : 'var(--surface-2)',
            border: expiryWarns ? '1px solid #f59e0b55' : '1px solid var(--line)',
            borderRadius: 10, padding: '12px 14px', fontSize: 13, color: expiryWarns ? 'var(--warning, #b45309)' : 'var(--text)',
          }}>
            <RiTimeLine style={{ width: 18, height: 18, flexShrink: 0 }} />
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--dim)' }}>{t('metaConnect.tokenExpiry')}</p>
              <p style={{ margin: 0 }}>{expiryText}</p>
            </div>
            {expiryWarns && (
              <button onClick={handleConnect} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(90deg, #1877f2, #0c4a9e)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {t('metaConnect.reconnect')}
              </button>
            )}
          </div>

          {/* Cuenta publicitaria y página: solo las que Graph devuelve para el
              token conectado; el backend rechaza cualquier otro id. */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <RiPagesLine style={{ width: 18, height: 18, color: 'var(--accent-soft)' }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{t('metaConnect.selectorTitle')}</p>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--dim)' }}>{t('metaConnect.selectorText')}</p>
            {optionsStatus === 'loading' && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }} aria-busy="true">{t('metaConnect.optionsLoading')}</p>}
            {optionsStatus === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--danger)' }}>
                <span>{t('metaConnect.optionsLoadError')}</span>
                <button onClick={loadOptions} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}>{t('metaConnect.reloadOptions')}</button>
              </div>
            )}
            {optionsStatus === 'ready' && options && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase' }}>
                  {t('metaConnect.adAccount')}
                  <select value={selectedAdAccount} onChange={e => setSelectedAdAccount(e.target.value)} style={{ ...inputStyle, textTransform: 'none', fontWeight: 500 }}>
                    {options.adAccounts.map(item => <option key={item.id} value={item.id}>{item.name ? `${item.name} · ${item.id}` : item.id}</option>)}
                  </select>
                </label>
                <label style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase' }}>
                  {t('metaConnect.page')}
                  <select value={selectedPage} onChange={e => setSelectedPage(e.target.value)} style={{ ...inputStyle, textTransform: 'none', fontWeight: 500 }}>
                    <option value="">{t('metaConnect.noPage')}</option>
                    {options.pages.map(item => <option key={item.id} value={item.id}>{item.name ? `${item.name} · ${item.id}` : item.id}</option>)}
                  </select>
                </label>
                <button
                  onClick={applySelection}
                  disabled={applyingSelection || !selectedAdAccount || (selectedAdAccount === (options.current?.adAccountId ?? '') && selectedPage === (options.current?.pageId ?? ''))}
                  style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: applyingSelection ? 'var(--surface-3)' : 'var(--accent-deep)', color: applyingSelection ? 'var(--muted)' : 'var(--on-accent)', fontSize: 13, fontWeight: 600, cursor: applyingSelection ? 'default' : 'pointer' }}
                >
                  {applyingSelection ? t('metaConnect.applying') : t('metaConnect.apply')}
                </button>
              </div>
            )}
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
                style={inputStyle}
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
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--dim)' }}>{t('meta.dailyCapHint')} {t('metaConnect.dailyCapEmptyHint')}</p>
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
                inputMode="numeric"
                style={inputStyle}
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
                    <h2>{t('metaConnect.autonomyTitle')}</h2>
                    <p>
                      {t('metaConnect.autonomyLevel', { level: quality.policy?.autonomyLevel ?? 'N1', mode: quality.policy?.mode ?? 'shadow' })}
                      {' '}
                      {quality.policy?.killSwitch === 'engaged'
                        ? t('metaConnect.stoppedReason', { reason: quality.policy.killSwitchReason ?? t('metaConnect.noReason') })
                        : t('metaConnect.noActionWithoutApproval')}
                    </p>
                  </div>
                  <button
                    className={`ads-action ${quality.policy?.killSwitch === 'engaged' ? 'primary' : 'secondary'}`}
                    onClick={toggleAutonomy}
                    disabled={stopping}
                  >
                    {quality.policy?.killSwitch === 'engaged' ? t('metaConnect.resumeAutonomy') : t('metaConnect.stopAutonomy')}
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
        title={t('metaConnect.disconnectTitle')}
        message={t('meta.disconnectConfirm')}
        confirmText={t('metaConnect.disconnectButton')}
        onConfirm={handleDisconnect}
        onClose={() => setShowDisconnect(false)}
      />}
    </div>
  )
}

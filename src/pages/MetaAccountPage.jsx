import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiMetaLine, RiLink, RiLinkUnlink, RiMoneyDollarCircleLine,
  RiCheckLine, RiAlertLine, RiCodeBoxLine,
} from 'react-icons/ri'
import '../dashboard.css'
import { getLocale, localeCode, useI18n } from '../i18n'

export default function MetaAccountPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [budget, setBudget] = useState('')
  const [pixelId, setPixelId] = useState('')
  const [savingPixel, setSavingPixel] = useState(false)
  const [message, setMessage] = useState('')

  const oauthStatus = searchParams.get('status')

  useEffect(() => {
    if (oauthStatus === 'connected') setMessage(t('meta.connected'))
    if (oauthStatus === 'error') setMessage(t('meta.connectError'))
  }, [oauthStatus, t])

  useEffect(() => {
    loadAccount()
  }, [])

  async function loadAccount() {
    try {
      const res = await apiFetch('/api/meta/accounts')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAccount(data)
      if (data?.dailyBudgetCapCents != null) setBudget(String(data.dailyBudgetCapCents / 100))
      setPixelId(data?.metaPixelId || '')
    } catch {
      setAccount(null)
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
    if (!account || !window.confirm(t('meta.disconnectConfirm'))) return
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #1877f2, #0c4a9e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RiMetaLine style={{ width: 22, height: 22, color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>{t('meta.title')}</h1>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>{t('meta.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
          padding: '10px 14px', borderRadius: 10,
          background: message.includes('No se pudo') || message.includes('desconectada') ? '#ef444415' : '#10b98115',
          border: message.includes('No se pudo') || message.includes('desconectada') ? '1px solid #ef444440' : '1px solid #10b98140',
          color: message.includes('No se pudo') || message.includes('desconectada') ? '#ef4444' : '#10b981',
          fontSize: 13,
        }}>
          {message.includes('No se pudo') || message.includes('desconectada') ? <RiAlertLine style={{ width: 16, height: 16 }} /> : <RiCheckLine style={{ width: 16, height: 16 }} />}
          {message}
        </div>
      )}

      {!account ? (
        <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '28px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 18px', fontSize: 14, color: '#94a3b8' }}>{t('meta.noAccount')}</p>
          <button
            onClick={handleConnect}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(90deg, #1877f2, #0c4a9e)', color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <RiLink style={{ width: 16, height: 16 }} /> {t('meta.connectAccount')}
          </button>
        </div>
      ) : (
        <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: t('meta.accountId'), value: account.metaAdAccountId },
              { label: t('meta.page'), value: account.metaPageId || '—' },
              { label: t('meta.status'), value: account.status },
              { label: t('meta.connectedAt'), value: new Date(account.connectedAt).toLocaleDateString(localeCode(getLocale())) },
            ].map(item => (
              <div key={item.label} style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase' }}>{item.label}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{item.value}</p>
              </div>
            ))}
          </div>

          <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 10, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <RiMoneyDollarCircleLine style={{ width: 18, height: 18, color: '#10b981' }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{t('meta.dailyCap')}</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                placeholder={t('meta.noCap')}
                style={{ flex: 1, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={saveBudget}
                disabled={saving}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: saving ? '#374151' : '#10b981', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                }}
              >
                {saving ? t('common.saving') : t('meta.save')}
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#4b5563' }}>{t('meta.dailyCapHint')}</p>
          </div>

          <div style={{ background: '#111827', border: '1px solid #1a2235', borderRadius: 10, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <RiCodeBoxLine style={{ width: 18, height: 18, color: '#818cf8' }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{t('meta.pixelId')}</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={pixelId}
                onChange={e => setPixelId(e.target.value)}
                placeholder="123456789012345"
                style={{ flex: 1, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={savePixelId}
                disabled={savingPixel}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: savingPixel ? '#374151' : '#818cf8', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: savingPixel ? 'default' : 'pointer',
                }}
              >
                {savingPixel ? t('common.saving') : t('meta.save')}
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: '#4b5563' }}>{t('meta.pixelHint')}</p>
          </div>

          <button
            onClick={handleDisconnect}
            style={{
              alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 8, border: '1px solid #ef444440',
              background: '#ef444415', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RiLinkUnlink style={{ width: 15, height: 15 }} /> {t('meta.disconnect')}
          </button>
        </div>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  RiBarChartBoxLine, RiCheckLine, RiFocus3Line, RiGroupLine,
  RiLoader4Line, RiLock2Line, RiRocketLine,
} from 'react-icons/ri'
import './campaign-share.css'
import { getLocale, localeCode, useI18n } from '../i18n'
import PageLoadingState from '../components/ui/PageLoadingState'

const STATUS = {
  draft: { label: 'En preparación', tone: 'is-draft' },
  active: { label: 'Activa', tone: 'is-active' },
  paused: { label: 'Pausada', tone: 'is-paused' },
  done: { label: 'Finalizada', tone: 'is-done' },
}

function Metric({ Icon, label, value, caption }) {
  return <article className="campaign-share-metric">
    <span><Icon /></span>
    <div><small>{label}</small><strong>{value}</strong><p>{caption}</p></div>
  </article>
}

export default function PublicCampaignSharePage() {
  const { t } = useI18n()
  const { token } = useParams()
  const [campaign, setCampaign] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let cancelled = false
    if (!token) { setState('not-found'); return undefined }

    fetch(`/api/public/campaigns/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } })
      .then(async response => ({ ok: response.ok, data: await response.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok || !data) { setState('not-found'); return }
        setCampaign(data)
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })

    return () => { cancelled = true }
  }, [token])

  const summary = useMemo(() => {
    const total = Number(campaign?.totalLeads ?? 0)
    const contacted = Number(campaign?.contacted ?? 0)
    const meetings = Number(campaign?.meetingsScheduled ?? 0)
    return {
      total,
      contacted,
      meetings,
      contactRate: total ? Math.round((contacted / total) * 100) : 0,
      conversionRate: total ? Math.round((meetings / total) * 100) : 0,
    }
  }, [campaign])

  if (state === 'loading') return <PageLoadingState label={t('campaignShare.loading')} />

  if (state !== 'ready') return <main className="campaign-share-page campaign-share-center"><section className="campaign-share-empty"><RiLock2Line /><h1>{state === 'not-found' ? t('campaignShare.unavailable') : t('campaignShare.loadError')}</h1><p>{state === 'not-found' ? t('campaignShare.askUpdatedLink') : t('campaignShare.retry')}</p></section></main>

  const status = STATUS[campaign.status] ?? STATUS.draft

  return <main className="campaign-share-page">
    <header className="campaign-share-header">
      <div className="campaign-share-brand"><span><RiRocketLine /></span><strong>Robin</strong><small>Campaign brief</small></div>
      <div className="campaign-share-secure"><RiLock2Line /> {t('campaignShare.readOnly')}</div>
    </header>

    <section className="campaign-share-hero">
      <div className="campaign-share-grid" aria-hidden="true" />
      <div className="campaign-share-hero-copy">
        <div className={`campaign-share-status ${status.tone}`}><i /> {status.label}</div>
        <p className="campaign-share-eyebrow">{t('campaignShare.campaignSummary')}</p>
        <h1>{campaign.name}</h1>
        <p className="campaign-share-objective">{campaign.objective || t('campaignShare.objectiveFallback')}</p>
      </div>
      <div className="campaign-share-orb"><div><RiBarChartBoxLine /><span>{summary.conversionRate}%<small>{t('campaignShare.conversion')}</small></span></div></div>
    </section>

    <section className="campaign-share-metrics" aria-label={t('campaignShare.metrics')}>
      <Metric Icon={RiGroupLine} label="Leads" value={summary.total.toLocaleString(localeCode(getLocale()))} caption={t('campaignShare.contactsAdded')} />
      <Metric Icon={RiFocus3Line} label={t('calls.contact')} value={summary.contacted.toLocaleString(localeCode(getLocale()))} caption={t('campaignShare.coverage', { rate: summary.contactRate })} />
      <Metric Icon={RiCheckLine} label={t('nav.meetings')} value={summary.meetings.toLocaleString(localeCode(getLocale()))} caption={t('campaignShare.opportunities')} />
    </section>

    <section className="campaign-share-progress">
      <div className="campaign-share-section-copy"><p>{t('campaignShare.commercialProgress')}</p><h2>{t('campaignShare.interestToConversation')}</h2><span>{t('campaignShare.realActivity')}</span></div>
      <div className="campaign-share-progress-list">
        <div><span><i className="is-indigo" /> {t('campaignShare.leadsReceived')}</span><strong>{summary.total}</strong><b style={{ width: '100%' }} /></div>
        <div><span><i className="is-cyan" /> {t('campaignShare.contactsWorked')}</span><strong>{summary.contacted}</strong><b className="is-cyan" style={{ width: `${summary.contactRate}%` }} /></div>
        <div><span><i className="is-green" /> {t('campaignShare.meetingsGenerated')}</span><strong>{summary.meetings}</strong><b className="is-green" style={{ width: `${summary.conversionRate}%` }} /></div>
      </div>
    </section>

    <footer className="campaign-share-footer"><span>{t('campaignShare.secureFooter')}</span><strong>{t('campaignShare.realtime')}</strong></footer>
  </main>
}

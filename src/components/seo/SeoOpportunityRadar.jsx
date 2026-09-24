import { memo, useMemo } from 'react'
import {
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiFlashlightLine,
  RiLightbulbFlashLine,
  RiSearchEyeLine,
} from 'react-icons/ri'
import './seo-components.css'
import { localeCode, useI18n } from '../../i18n'

function formatNumber(value, locale) {
  return new Intl.NumberFormat(localeCode(locale), { maximumFractionDigits: 0 }).format(value ?? 0)
}

function buildOpportunities({ report, searchConsole }) {
  if (!searchConsole?.connected || !searchConsole.totalQueries) return []

  const planned = (report?.keywords ?? []).map((item) => item.keyword.toLowerCase())
  const matched = (searchConsole.quickWins ?? (searchConsole.matched ?? []).flatMap((group) =>
    (group.rows ?? []).map((row) => ({ ...row, keyword: group.keyword })),
  )).map((row) => ({
    ...row,
    keyword: row.keyword || row.query,
    kind: 'quick-win',
  }))
    .filter((row) => row.impressions > 0 && row.position != null && row.position >= 4 && row.position <= 20)

  const quickWinQueries = new Set(matched.map((row) => row.query.toLowerCase()))
  const hidden = (searchConsole.contentGaps ?? (searchConsole.topQueries ?? []))
    .filter((row) => row.impressions > 0 && row.position != null && row.position > 5)
    .filter((row) => !quickWinQueries.has(row.query.toLowerCase()))
    .filter((row) => !planned.some((keyword) => row.query.toLowerCase().includes(keyword) || keyword.includes(row.query.toLowerCase())))
    .map((row) => ({ ...row, keyword: row.query, kind: 'hidden-demand' }))

  return [...matched, ...hidden]
    .sort((a, b) => (b.impressions * (1 / (b.position || 20))) - (a.impressions * (1 / (a.position || 20))))
    .filter((row, index, all) => all.findIndex((item) => item.query.toLowerCase() === row.query.toLowerCase()) === index)
    .slice(0, 6)
}

function OpportunityCard({ item, onOpenFactory }) {
  const { t, locale } = useI18n()
  const isHidden = item.kind === 'hidden-demand'
  const ctr = item.impressions ? (item.clicks / item.impressions) * 100 : 0
  const advice = isHidden
    ? t('webSeo.radar.adviceGuide')
    : item.position <= 10
      ? t('webSeo.radar.adviceTop10')
      : t('webSeo.radar.adviceCoverage')

  return (
    <article className={`seo-opportunity-card${isHidden ? ' is-hidden-demand' : ''}`}>
      <div className="seo-opportunity-card-head">
        <span className="seo-opportunity-kind">
          {isHidden ? <RiLightbulbFlashLine /> : <RiFlashlightLine />}
          {isHidden ? t('webSeo.radar.hiddenDemand') : t('webSeo.radar.quickWin')}
        </span>
        <span className="seo-opportunity-position">{t('webSeo.radar.position', { n: item.position.toFixed(1) })}</span>
      </div>
      <strong>{item.query}</strong>
      <p>{advice}</p>
      <div className="seo-opportunity-stats">
        <span><b>{formatNumber(item.impressions, locale)}</b> {t('webSeo.radar.impressions')}</span>
        <span><b>{formatNumber(item.clicks, locale)}</b> {t('webSeo.radar.clicks')}</span>
        <span><b>{ctr.toFixed(1)}%</b> CTR</span>
      </div>
      <button type="button" className="seo-button small" onClick={() => onOpenFactory(item.keyword, isHidden ? 'pasiva' : 'activa')}>
        {isHidden ? t('webSeo.radar.createGuide') : t('webSeo.radar.optimize')} <RiArrowRightLine />
      </button>
    </article>
  )
}

function SeoOpportunityRadar({ report, searchConsole, onOpenFactory, onOpenTab }) {
  const { t } = useI18n()
  const opportunities = useMemo(() => buildOpportunities({ report, searchConsole }), [report, searchConsole])
  if (!searchConsole?.connected || !searchConsole.totalQueries) return null

  const quickWins = opportunities.filter((item) => item.kind === 'quick-win').length
  const hiddenDemand = opportunities.filter((item) => item.kind === 'hidden-demand').length

  return (
    <section className="seo-opportunity-radar seo-rise" aria-labelledby="seo-opportunity-title">
      <header className="seo-opportunity-head">
        <div>
          <span className="seo-overline">{t('webSeo.radar.overline')}</span>
          <h2 id="seo-opportunity-title"><RiSearchEyeLine /> {t('webSeo.radar.title')}</h2>
          <p>{t('webSeo.radar.intro')}</p>
        </div>
        <div className="seo-opportunity-summary">
          <span><b>{quickWins}</b> {t('webSeo.radar.quickWins')}</span>
          <span><b>{hiddenDemand}</b> {t('webSeo.radar.newTopics')}</span>
          <button type="button" className="seo-button small" onClick={() => onOpenTab('contenidos')}>
            {t('webSeo.radar.seePlan')} <RiArrowRightLine />
          </button>
        </div>
      </header>
      {opportunities.length ? (
        <div className="seo-opportunity-grid">
          {opportunities.map((item) => <OpportunityCard key={`${item.kind}-${item.query}`} item={item} onOpenFactory={onOpenFactory} />)}
        </div>
      ) : (
        <div className="seo-opportunity-empty"><RiBarChartBoxLine /><span>{t('webSeo.radar.empty')}</span></div>
      )}
    </section>
  )
}

export default memo(SeoOpportunityRadar)

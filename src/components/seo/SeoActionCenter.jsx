import { memo, useMemo, useState } from 'react'
import {
  RiArrowRightLine,
  RiCheckLine,
  RiCheckboxBlankCircleLine,
  RiFlashlightLine,
  RiGlobalLine,
  RiLineChartLine,
  RiMapPin2Line,
  RiSearchEyeLine,
  RiToolsLine,
} from 'react-icons/ri'
import './seo-components.css'
import { useI18n } from '../../i18n'

function buildActions({ report, searchConsole, stale }, t) {
  const failed = (report?.checklist ?? []).filter((item) => !item.ok)
  const content = report?.contentPlan ?? []
  const keywords = report?.keywords ?? []
  const actions = []

  if (failed.length) {
    actions.push({
      id: 'technical',
      type: t('webSeo.actionCenter.urgent'),
      tone: 'danger',
      icon: RiToolsLine,
      title: t('webSeo.panels.queue.fix', { label: failed[0].label.toLowerCase() }),
      copy: failed[0].hint || t('webSeo.panels.queue.nextBlocker'),
      cta: t('webSeo.panels.queue.seeTechnical'),
      tab: 'tecnico',
    })
  } else if (keywords[0]) {
    actions.push({
      id: 'active-page',
      type: t('webSeo.actionCenter.next'),
      tone: 'success',
      icon: RiFlashlightLine,
      title: t('webSeo.panels.queue.createPage', { keyword: keywords[0].keyword }),
      copy: t('webSeo.panels.queue.createPageCopy'),
      cta: t('webSeo.panels.queue.openFactory'),
      keyword: keywords[0].keyword,
    })
  }

  if (!searchConsole?.connected) {
    actions.push({
      id: 'measurement',
      type: t('webSeo.actionCenter.measurement'),
      tone: 'cyan',
      icon: RiGlobalLine,
      title: t('webSeo.panels.queue.connectSc'),
      copy: t('webSeo.panels.queue.scCopy'),
      cta: t('webSeo.actionCenter.seeKeywords'),
      tab: 'keywords',
    })
  } else if (keywords[1]) {
    actions.push({
      id: 'passive-page',
      type: t('webSeo.actionCenter.opportunity'),
      tone: 'cyan',
      icon: RiSearchEyeLine,
      title: t('webSeo.actionCenter.attackGuide', { keyword: keywords[1].keyword }),
      copy: t('webSeo.actionCenter.attackCopy'),
      cta: t('webSeo.actionCenter.createGuide'),
      keyword: keywords[1].keyword,
      mode: 'pasiva',
    })
  }

  if (stale.length) {
    actions.push({
      id: 'refresh',
      type: t('webSeo.actionCenter.maintenance'),
      tone: 'warn',
      icon: RiLineChartLine,
      title: stale.length === 1 ? t('webSeo.panels.queue.refreshOne') : t('webSeo.panels.queue.refreshMany', { n: stale.length }),
      copy: t('webSeo.panels.queue.refreshCopy'),
      cta: t('webSeo.panels.queue.seeContent'),
      tab: 'contenidos',
    })
  } else if (content[0]) {
    actions.push({
      id: 'content',
      type: t('webSeo.actionCenter.plan'),
      tone: 'violet',
      icon: RiMapPin2Line,
      title: t('webSeo.actionCenter.planTitle', { title: content[0].title }),
      copy: t('webSeo.actionCenter.planCopy'),
      cta: t('webSeo.panels.queue.openFactory'),
      keyword: content[0].keyword,
    })
  }

  return actions.slice(0, 4)
}

function ActionItem({ item, done, onComplete, onOpenFactory, onOpenTab }) {
  const { t } = useI18n()
  const Icon = item.icon
  function execute() {
    if (item.keyword) onOpenFactory(item.keyword, item.mode)
    else if (item.tab) onOpenTab(item.tab)
  }
  return (
    <article className={`seo-action-item tone-${item.tone}${done ? ' is-done' : ''}`}>
      <button type="button" className="seo-action-check" onClick={() => onComplete(item.id)} aria-label={done ? t('webSeo.actionCenter.markPending', { title: item.title }) : t('webSeo.actionCenter.markDone', { title: item.title })} aria-pressed={done}>
        {done ? <RiCheckLine /> : <RiCheckboxBlankCircleLine />}
      </button>
      <span className="seo-action-icon"><Icon /></span>
      <div className="seo-action-copy"><span>{item.type}</span><strong>{item.title}</strong><p>{item.copy}</p></div>
      <button type="button" className="seo-button small seo-action-cta" onClick={execute}>{item.cta} <RiArrowRightLine /></button>
    </article>
  )
}

function SeoActionCenter({ report, searchConsole, stale, onOpenFactory, onOpenTab }) {
  const { t } = useI18n()
  const actions = useMemo(() => buildActions({ report, searchConsole, stale }, t), [report, searchConsole, stale, t])
  const [completed, setCompleted] = useState(() => new Set())
  const completedCount = actions.filter((item) => completed.has(item.id)).length
  const progress = actions.length ? Math.round((completedCount / actions.length) * 100) : 0

  function toggle(itemId) {
    setCompleted((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  if (!actions.length) return null
  return (
    <section className="seo-action-center seo-rise" aria-labelledby="seo-action-title">
      <header className="seo-action-head">
        <div><span className="seo-overline">{t('webSeo.actionCenter.overline')}</span><h2 id="seo-action-title">{t('webSeo.actionCenter.title')}</h2><p>{t('webSeo.actionCenter.intro')}</p></div>
        <div className="seo-action-progress"><strong>{progress}%</strong><span>{t('webSeo.actionCenter.completed', { done: completedCount, total: actions.length })}</span><i><b style={{ width: `${progress}%` }} /></i></div>
      </header>
      <div className="seo-action-list">
        {actions.map((item) => <ActionItem key={item.id} item={item} done={completed.has(item.id)} onComplete={toggle} onOpenFactory={onOpenFactory} onOpenTab={onOpenTab} />)}
      </div>
    </section>
  )
}

export default memo(SeoActionCenter)

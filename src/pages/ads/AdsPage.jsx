import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RiAlertLine, RiCheckboxCircleLine, RiMegaphoneLine, RiRefreshLine } from 'react-icons/ri'
import { useI18n } from '../../i18n'
import { useThemeColors } from '../../hooks/useTheme'
import DataStatusBanner from '../../components/ui/DataStatusBanner'
import PageLoadingState from '../../components/ui/PageLoadingState'
import ProductPageHeader from '../../components/ui/ProductPageHeader'
import CreativeCommandCenterPage from '../CreativeCommandCenterPage'
import CampaignContextBar from './CampaignContextBar'
import ResumenPanel from './panels/ResumenPanel'
import EstructuraPanel from './panels/EstructuraPanel'
import CreatividadesPanel from './panels/CreatividadesPanel'
import ExperimentosPanel from './panels/ExperimentosPanel'
import MedicionPanel from './panels/MedicionPanel'
import DecisionesPanel from './panels/DecisionesPanel'
import { useAdsOverview } from './useAdsOverview'
import { useAdsPlan } from './useAdsPlan'
import '../growth/growth-surface.css'
import '../ads.css'
import './ads-hub.css'
import '../growth-visual-standard.css'

// Publicidad es la activación de una campaña global en los canales de pago:
// la campaña (estrategia, oferta, presupuesto, destino) se define en
// Planificar y aquí se ejecuta y se mide. La página se organiza en pestañas
// enlazables (?tab=) como el resto de Growth, y la campaña en la que se
// trabaja viaja en ?campaign= para que un enlace abra exactamente ese contexto.

// Las etiquetas de pestaña viven en ads.page.tabs.<id>.
const TAB_IDS_LIST = ['resumen', 'estructura', 'creatividades', 'experimentos', 'medicion', 'decisiones']
const TAB_IDS = new Set(TAB_IDS_LIST)

export default function AdsPage() {
  const { t, locale } = useI18n()
  const colors = useThemeColors()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const overviewState = useAdsOverview({ locale, t })
  const planState = useAdsPlan({ enabled: overviewState.dataStatus !== 'plan', notify: overviewState.showNotice, t })
  const { overview, loading, dataStatus, dataError, notice, showNotice, pendingActions, loadOverview } = overviewState

  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab')
    return TAB_IDS.has(requested) ? requested : 'resumen'
  })
  const selectTab = useCallback(id => {
    setTab(id)
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.set('tab', id)
      return next
    }, { replace: true })
  }, [setSearchParams])
  useEffect(() => {
    const requested = searchParams.get('tab')
    if (requested && TAB_IDS.has(requested) && requested !== tab) setTab(requested)
  }, [searchParams, tab])

  // El Creator Studio no es una página paralela: es la herramienta del átomo
  // "Creatividades". Se abre con ?studio=1 (y ?brief= para el contexto) para
  // que sobreviva a un refresh y se pueda enlazar, cosa que el estado local
  // de la versión anterior no permitía.
  const studioOpen = searchParams.get('studio') === '1'
  const openStudio = useCallback(briefId => {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.set('tab', 'creatividades')
      next.set('studio', '1')
      // La campaña viaja en la URL: sin esto, un enlace al estudio abierto en
      // otro navegador no podría cargar el brief (o entregaría a la campaña
      // que ese navegador tuviera recordada).
      if (planState.selectedId) next.set('campaign', planState.selectedId)
      if (briefId) next.set('brief', briefId)
      else next.delete('brief')
      return next
    })
    setTab('creatividades')
  }, [setSearchParams, planState.selectedId])
  const closeStudio = useCallback(() => {
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.delete('studio')
      next.delete('brief')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const studioBrief = useMemo(() => {
    if (!studioOpen) return null
    const briefId = searchParams.get('brief')
    const brief = briefId ? (planState.plan?.briefs ?? []).find(b => b.id === briefId) : null
    if (!brief) return null
    const audience = (planState.plan?.audiences ?? []).find(a => a.id === brief.audienceId) ?? null
    return {
      ...brief,
      campaignName: planState.plan?.campaign?.name ?? planState.selectedCampaign?.name ?? '',
      audienceName: brief.audienceName ?? audience?.name ?? null,
    }
  }, [studioOpen, searchParams, planState.plan, planState.selectedCampaign])

  // La entrega desde el estudio crea la creatividad ya vinculada al brief y a
  // la campaña: al volver a Ads la pieza aparece dentro de su campaña, con el
  // flujo de aprobación por delante.
  const deliverFromStudio = useCallback(async payload => {
    const campaignId = studioBrief?.campaignId ?? planState.selectedId
    if (!campaignId) {
      showNotice(t('ads.page.studioNeedsCampaign'))
      return false
    }
    // El backend valida los campos como opcionales, no como nulables: un campo
    // sin valor se omite en vez de viajar como null.
    const clean = Object.fromEntries(Object.entries({ briefId: studioBrief?.id, ...payload }).filter(([, v]) => v != null))
    const created = await planState.createCreative({ campaignId, ...clean })
    if (created) showNotice(t('ads.page.studioDelivered'))
    return Boolean(created)
  }, [studioBrief, planState, showNotice, t])

  const ui = useMemo(() => ({ t, locale, colors, selectTab, openStudio, showNotice, navigate }),
    [t, locale, colors, selectTab, openStudio, showNotice, navigate])

  const inReviewCount = (planState.plan?.creatives ?? []).filter(c => c.approvalStatus === 'in_review').length
  const decisionsCount = (overview?.decisions?.length ?? 0) + pendingActions.length
  const qualityIssue = Boolean(overview?.dataQuality?.status && overview.dataQuality.status !== 'ready')
  const tabCounts = { creatividades: inReviewCount || null, decisiones: decisionsCount || null }

  if (studioOpen) {
    return <CreativeCommandCenterPage onOpenPerformance={closeStudio} brief={studioBrief} onDeliver={deliverFromStudio} />
  }

  if (loading && !overview) {
    return <PageLoadingState label={t('ads.page.loading')} />
  }

  return <main className="gs-page ads-hub dark-scroll">
    <div className="gs-shell">
      <ProductPageHeader Icon={RiMegaphoneLine} title={t('ads.page.title')} description={t('ads.page.subtitle')} />

      {overview && dataStatus !== 'empty' && <DataStatusBanner
        status={dataStatus}
        message={dataError}
        onRetry={dataStatus === 'disconnected' || dataStatus === 'error' ? loadOverview : undefined}
      />}

      {!overview ? <section className="ads-error" role="alert"><RiAlertLine /><div><strong>{t('ads.page.loadErrorTitle')}</strong><span>{dataError || t('ads.page.loadErrorHint')}</span></div><button type="button" className="ads-action secondary" onClick={loadOverview}><RiRefreshLine /> {t('ads.page.retry')}</button></section> : <>
        <CampaignContextBar overview={overviewState} plan={planState} ui={ui} />

        <nav className="gs-tabs" aria-label={t('ads.page.sectionsAria')}>
          {TAB_IDS_LIST.map(id => <button
            key={id}
            type="button"
            className={`${tab === id ? 'active' : ''}${id === 'medicion' && qualityIssue ? ' has-issue' : ''}`}
            onClick={() => selectTab(id)}
          >{t(`ads.page.tabs.${id}`)}{tabCounts[id] ? <b>{tabCounts[id]}</b> : null}</button>)}
        </nav>

        {tab === 'resumen' ? <ResumenPanel overview={overviewState} plan={planState} ui={ui} /> : null}
        {tab === 'estructura' ? <EstructuraPanel overview={overviewState} plan={planState} ui={ui} /> : null}
        {tab === 'creatividades' ? <CreatividadesPanel overview={overviewState} plan={planState} ui={ui} /> : null}
        {tab === 'experimentos' ? <ExperimentosPanel overview={overviewState} plan={planState} ui={ui} /> : null}
        {tab === 'medicion' ? <MedicionPanel overview={overviewState} plan={planState} ui={ui} /> : null}
        {tab === 'decisiones' ? <DecisionesPanel overview={overviewState} plan={planState} ui={ui} /> : null}
      </>}

      {notice && <div className="ads-toast" role="status"><RiCheckboxCircleLine /> {notice}</div>}
    </div>
  </main>
}

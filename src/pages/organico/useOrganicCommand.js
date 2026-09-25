import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  approveOrganicAutonomyDecision,
  connectOrganicWeb,
  configureOrganicIntegration,
  createOrganicDraft,
  createOrganicProject,
  demoteOrganicAutonomyKind,
  disconnectOrganicIntegration,
  dismissOrganicRecommendation,
  dispatchOrganicRecommendation,
  fetchOrganicAutonomy,
  fetchOrganicIntegrations,
  fetchOrganicOverview,
  fetchOrganicRecommendations,
  promoteOrganicAutonomyKind,
  refreshOrganicRecommendations,
  rejectOrganicAutonomyDecision,
  runOrganicAutonomyPass,
  startOrganicOAuth,
  syncOrganicIntegration,
  updateOrganicAutonomy,
} from '../../lib/organic/organicApi'
import { DEMO_MODE } from '../../lib/dataMode'
import { createTranslator, getLocale, useI18n } from '../../i18n'

const CONNECTED_INTEGRATION_STATUSES = new Set(['connected', 'active', 'ready', 'synced'])

export function integrationPresentation(integration, t = createTranslator(getLocale())) {
  const status = integration?.status || 'not_connected'
  const connected = CONNECTED_INTEGRATION_STATUSES.has(status)
  const hasProperty = Boolean(integration?.externalPropertyId)
  if (status === 'error' || integration?.lastError) return { label: t('organic.commandHook.statusReview'), tone: 'bad', connected, hasProperty }
  if (connected && !hasProperty) return { label: t('organic.commandHook.statusPropertyPending'), tone: 'warn', connected, hasProperty }
  if (connected) return { label: t('organic.commandHook.statusConnected'), tone: 'ok', connected, hasProperty }
  if (status === 'syncing') return { label: t('organic.commandHook.statusSyncing'), tone: 'warn', connected: false, hasProperty }
  return { label: t('organic.commandHook.statusNotConnected'), tone: 'idle', connected: false, hasProperty }
}

function hasOrganicSignals(data) {
  if (!data) return false
  const kpis = data.kpis || {}
  return Object.values(kpis).some(value => Number(value) > 0)
    || Boolean(data.opportunity?.score || data.opportunity?.summary)
    || [data.demand?.points, data.demand?.opportunities, data.actions, data.local?.areas, data.ai?.items, data.assets, data.leads, data.competitorGap?.items]
      .some(items => Array.isArray(items) && items.length > 0)
}

/**
 * Centro de mando orgánico: medición del circuito (overview), fuentes de
 * datos, cola de recomendaciones y sala de autonomía. Es el "qué pasa y qué
 * conviene hacer"; ejecutar es del estudio y de los otros brazos.
 *
 * Ninguna carga tumba a las demás: overview, recomendaciones, autonomía e
 * integraciones se piden por separado y cada una deja su propio estado.
 */
export function useOrganicCommand({ notify }) {
  const { t } = useI18n()
  const [period, setPeriod] = useState('30d')
  const [projectId, setProjectId] = useState('')
  const [view, setView] = useState({ status: 'loading', data: null, error: '', gate: null })
  const [integrationState, setIntegrationState] = useState({ status: 'loading', integrations: [], error: '', message: '', busyProvider: '' })
  const [recommendations, setRecommendations] = useState([])
  const [refreshingRecs, setRefreshingRecs] = useState(false)
  const [dispatching, setDispatching] = useState('')
  const [autonomy, setAutonomy] = useState(null)
  const [autonomyBusy, setAutonomyBusy] = useState(false)
  const [autonomyMessage, setAutonomyMessage] = useState('')
  const [modal, setModal] = useState(null)
  const [modalMessage, setModalMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadAutonomy = useCallback(async () => {
    // Si la sala falla se queda sin panel; el resto del centro sigue en pie.
    setAutonomy(await fetchOrganicAutonomy().catch(() => null))
  }, [])

  const loadRecommendations = useCallback(async () => {
    setRecommendations(await fetchOrganicRecommendations().catch(() => []))
  }, [])

  const loadOverview = useCallback(async () => {
    setView(current => ({ ...current, status: 'loading', error: '' }))
    loadRecommendations()
    loadAutonomy()
    try {
      const result = await fetchOrganicOverview({ projectId, period })
      const status = result.status === 'ready' && !hasOrganicSignals(result.data) ? 'empty' : result.status
      setView({ status, data: result.data, error: '', gate: result.gate || null })
    } catch (error) {
      setView({
        status: 'error',
        data: null,
        gate: null,
        error: DEMO_MODE
          ? t('organic.commandHook.demoNoData')
          : error.message || t('organic.commandHook.unexpected'),
      })
    }
  }, [projectId, period, loadAutonomy, loadRecommendations, t])

  const loadIntegrations = useCallback(async () => {
    setIntegrationState(current => ({ ...current, status: 'loading', error: '', message: '' }))
    try {
      const result = await fetchOrganicIntegrations()
      setIntegrationState(current => ({ ...current, ...result, error: result.error || '', message: '' }))
    } catch (error) {
      setIntegrationState(current => ({ ...current, status: 'error', error: error.message || t('organic.commandHook.integrationsLoadFailed'), message: '' }))
    }
  }, [t])

  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => { loadIntegrations() }, [loadIntegrations])

  const data = view.data
  const projects = useMemo(() => (data?.project ? [data.project] : []), [data])

  function openModal(type, target = null, action = 'draft') {
    setModal({ type, target, action })
    setModalMessage('')
  }

  async function submitModal(form) {
    setSubmitting(true)
    setModalMessage('')
    try {
      if (modal?.action === 'project') await createOrganicProject(form)
      else if (modal?.action === 'connect') await connectOrganicWeb(form)
      else await createOrganicDraft({ ...form, projectId: data?.project?.id, opportunityId: modal?.target?.id || null, type: modal?.target?.type || 'service_page' })
      await loadOverview()
      setModal(null)
      notify?.(modal?.action === 'project' ? t('organic.commandHook.projectCreated') : modal?.action === 'connect' ? t('organic.commandHook.projectUpdated') : t('organic.commandHook.draftReady'))
    } catch (error) {
      setModalMessage(error.message || t('organic.commandHook.actionFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleIntegrationAction(provider, action, value) {
    setIntegrationState(current => ({ ...current, busyProvider: provider, message: '' }))
    try {
      if (action === 'connect') {
        const result = await startOrganicOAuth(provider)
        const authorizationUrl = result?.authorizationUrl || result?.url || result?.redirectUrl
        if (authorizationUrl) {
          window.location.assign(authorizationUrl)
          return
        }
        setIntegrationState(current => ({ ...current, message: t('organic.commandHook.oauthNoUrl') }))
      } else if (action === 'disconnect') {
        await disconnectOrganicIntegration(provider)
        await loadIntegrations()
      } else if (action === 'configure') {
        if (!value) return
        await configureOrganicIntegration(provider, value)
        await loadIntegrations()
      } else if (action === 'sync') {
        await syncOrganicIntegration(provider)
        await Promise.all([loadIntegrations(), loadOverview()])
        notify?.(t('organic.commandHook.sourceSynced'))
      }
    } catch (error) {
      setIntegrationState(current => ({ ...current, message: error.message || t('organic.commandHook.integrationFailed') }))
    } finally {
      setIntegrationState(current => ({ ...current, busyProvider: '' }))
    }
  }

  /** Despachar no ejecuta: devuelve la URL del brazo con el contexto cargado. */
  async function dispatchRecommendation(id) {
    setDispatching(id)
    try {
      const body = await dispatchOrganicRecommendation(id)
      return body?.url || null
    } catch (error) {
      notify?.(error.message || t('organic.commandHook.dispatchFailed'))
      return null
    } finally {
      setDispatching('')
    }
  }

  async function dismissRecommendation(id, reason) {
    await dismissOrganicRecommendation(id, reason).catch(() => {})
    setRecommendations(current => current.filter(item => item.id !== id))
  }

  async function refreshRecommendations() {
    setRefreshingRecs(true)
    try {
      await refreshOrganicRecommendations()
      setRecommendations(await fetchOrganicRecommendations())
    } catch {
      // El endpoint ya explica el motivo; la cola se queda como estaba.
    } finally {
      setRefreshingRecs(false)
    }
  }

  /**
   * Toda acción de gobierno recarga el estado: el nivel efectivo depende de la
   * calidad de datos y del freno compartido, así que lo enviado no es
   * necesariamente lo que quedó guardado.
   */
  async function withAutonomy(operation) {
    setAutonomyBusy(true)
    setAutonomyMessage('')
    try {
      await operation()
    } catch (error) {
      setAutonomyMessage(error.message || t('organic.commandHook.autonomyFailed'))
    } finally {
      await loadAutonomy()
      setAutonomyBusy(false)
    }
  }

  const autonomyActions = {
    onChangeLevel: level => withAutonomy(() => updateOrganicAutonomy({ level })),
    onToggleShadow: shadowMode => withAutonomy(() => updateOrganicAutonomy({ shadowMode })),
    onRun: () => withAutonomy(runOrganicAutonomyPass),
    onApprove: id => withAutonomy(() => approveOrganicAutonomyDecision(id)),
    onReject: (id, reason) => withAutonomy(() => rejectOrganicAutonomyDecision(id, reason)),
    onPromote: kind => withAutonomy(() => promoteOrganicAutonomyKind(kind)),
    onDemote: kind => withAutonomy(() => demoteOrganicAutonomyKind(kind, t('organic.commandHook.demoteReason'))),
  }

  const connectedSources = integrationState.integrations?.filter(item => integrationPresentation(item, t).connected).length || 0
  const pendingDecisions = autonomy?.decisions?.filter(item => ['advisory', 'pending_approval', 'shadow'].includes(item.status)).length || 0
  const hasProject = Boolean(data?.project)

  return {
    period, setPeriod, projectId, setProjectId, projects,
    view, data, hasProject, reload: loadOverview,
    integrationState, loadIntegrations, handleIntegrationAction, connectedSources,
    recommendations, refreshingRecs, dispatching, dispatchRecommendation, dismissRecommendation, refreshRecommendations,
    autonomy, autonomyBusy, autonomyMessage, autonomyActions, pendingDecisions,
    modal, modalMessage, submitting, openModal, closeModal: () => setModal(null), submitModal,
  }
}

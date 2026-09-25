import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { planGateMessage, readPlanGate } from '../../lib/planGate'
import { DEMO_MODE } from '../../lib/dataMode'

/**
 * Estado y acciones de la operación de Ads a nivel organización: el overview
 * de `/api/ads/overview` más los tres circuitos que se piden aparte (acciones
 * pendientes, reglas de autonomía y experimentos).
 *
 * Devuelve:
 * - overview, loading, dataStatus ('loading'|'live'|'empty'|'plan'|'disconnected'), dataError
 * - pendingActions, rules, experiments
 * - notice, showNotice(message)
 * - decidingId, busyRule, refreshingQuality, managingCampaign
 * - decisionsByCampaign (Map campaignId -> decisiones)
 * - loadOverview()
 * - decideOnRecommendation(decisionId, 'approve'|'reject', reason?)
 * - runAction(actionId, 'execute'|'compensate')
 * - changeRuleAutonomy(ruleKey, 'promote'|'demote')
 * - toggleAutonomyStop(stop)
 * - refreshDataQuality()
 * - manageCampaign(campaignId, 'publish'|'activate'|'pause')
 * - createExperiment(payload), changeExperiment(experimentId, 'start'|'conclude')
 * - syncCampaign(campaignId)
 */
export function useAdsOverview({ locale, t }) {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [refreshingQuality, setRefreshingQuality] = useState(false)
  const [decidingId, setDecidingId] = useState('')
  const [pendingActions, setPendingActions] = useState([])
  const [rules, setRules] = useState([])
  const [experiments, setExperiments] = useState([])
  const [busyRule, setBusyRule] = useState('')
  const [managingCampaign, setManagingCampaign] = useState(false)
  const [dataStatus, setDataStatus] = useState('loading')
  const [dataError, setDataError] = useState('')
  const noticeTimer = useRef(null)

  useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current) }, [])

  const showNotice = useCallback(message => {
    setNotice(message)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3600)
  }, [])

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setDataStatus('loading')
    setDataError('')
    try {
      const response = await apiFetch('/api/ads/overview')
      if (!response.ok) {
        // Bloqueo de plan (403/409 con codigo): no es una caida, la pagina se muestra vacia con su aviso.
        const gate = await readPlanGate(response)
        if (gate) { setOverview({ campaigns: [] }); setDataStatus('plan'); setDataError(planGateMessage(gate, locale)); return }
        throw new Error('overview-failed')
      }
      const data = await response.json()
      // Las acciones pendientes se piden aparte: llevan la comprobación de
      // guardarraíles en vivo, que no tiene sentido cachear con el resumen.
      apiFetch('/api/ads/actions/pending')
        .then(res => (res.ok ? res.json() : []))
        .then(rows => setPendingActions(Array.isArray(rows) ? rows : []))
        .catch(() => setPendingActions([]))
      apiFetch('/api/ads/rules')
        .then(res => (res.ok ? res.json() : []))
        .then(rows => setRules(Array.isArray(rows) ? rows : []))
        .catch(() => setRules([]))
      apiFetch('/api/ads/experiments')
        .then(res => (res.ok ? res.json() : []))
        .then(rows => setExperiments(Array.isArray(rows) ? rows : []))
        .catch(() => setExperiments([]))
      const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : []
      setOverview({ ...(data || {}), campaigns })
      setDataStatus(campaigns.length ? 'live' : 'empty')
    } catch {
      setOverview(null)
      setDataStatus('disconnected')
      setDataError(DEMO_MODE ? t('ads.overview.demoDisconnected') : t('ads.overview.disconnected'))
    } finally { setLoading(false) }
  }, [locale, t])

  useEffect(() => { loadOverview() }, [loadOverview])

  const decisionsByCampaign = useMemo(() => {
    const map = new Map()
    for (const decision of overview?.decisions ?? []) {
      if (!decision.campaignId) continue
      map.set(decision.campaignId, [...(map.get(decision.campaignId) ?? []), decision])
    }
    return map
  }, [overview])

  // Aprobar deja la acción registrada y pendiente, con sus guardarraíles ya
  // evaluados; no toca Meta. Rechazar exige motivo.
  const decideOnRecommendation = useCallback(async (decisionId, verb, reason) => {
    setDecidingId(decisionId)
    try {
      const response = await apiFetch(`/api/ads/decisions/${decisionId}/${verb}`, {
        method: 'POST',
        body: JSON.stringify(verb === 'reject' ? { reason } : {}),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body?.error || 'decision-failed')
      }
      showNotice(verb === 'approve' ? t('ads.overview.approved') : t('ads.overview.rejected'))
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || t('ads.overview.decisionFailed'))
    } finally {
      setDecidingId('')
    }
  }, [loadOverview, showNotice, t])

  // Ejecutar revalida los guardarraíles en el servidor: si algo cambió desde
  // la aprobación, devuelve 409 con el motivo concreto y no toca Meta.
  const runAction = useCallback(async (actionId, verb = 'execute') => {
    setDecidingId(actionId)
    try {
      const response = await apiFetch(`/api/ads/actions/${actionId}/${verb}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'action-failed')
      showNotice(verb === 'execute' ? t('ads.overview.executed') : t('ads.overview.compensated'))
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || t('ads.overview.actionFailed'))
    } finally {
      setDecidingId('')
    }
  }, [loadOverview, showNotice, t])

  // Promover amplía lo que el sistema hace solo, así que el servidor vuelve a
  // comprobar que la regla se lo ha ganado y devuelve 409 con lo que falta.
  const changeRuleAutonomy = useCallback(async (ruleKey, verb) => {
    setBusyRule(ruleKey)
    try {
      const response = await apiFetch(`/api/ads/rules/${ruleKey}/${verb}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.blockers?.join(' ') || body?.error || 'rule-failed')
      showNotice(verb === 'promote' ? t('ads.overview.rulePromoted') : t('ads.overview.ruleDemoted'))
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || t('ads.overview.ruleFailed'))
    } finally {
      setBusyRule('')
    }
  }, [loadOverview, showNotice, t])

  const toggleAutonomyStop = useCallback(async stop => {
    try {
      const response = await apiFetch('/api/ads/policy/stop', {
        method: 'POST',
        body: JSON.stringify(stop ? { reason: t('ads.overview.stopReason') } : { resume: true }),
      })
      if (!response.ok) throw new Error('stop-failed')
      showNotice(stop ? t('ads.overview.autonomyStopped') : t('ads.overview.autonomyResumed'))
      await loadOverview()
    } catch {
      showNotice(t('ads.overview.autonomyFailed'))
    }
  }, [loadOverview, showNotice, t])

  // Recomprueba permisos, frescura, atribución y consentimiento sin esperar a
  // que caduque la caché del último diagnóstico.
  const refreshDataQuality = useCallback(async () => {
    setRefreshingQuality(true)
    try {
      const response = await apiFetch('/api/ads/data-quality/refresh', { method: 'POST' })
      if (!response.ok) throw new Error('data-quality-failed')
      await loadOverview()
    } catch {
      showNotice(t('ads.overview.qualityFailed'))
    } finally {
      setRefreshingQuality(false)
    }
  }, [loadOverview, showNotice, t])

  // El backend devuelve 4xx con code y mensaje concreto (sin página, sin
  // creatividad aprobada, APP_URL local, consentimiento…) o 502/504 si falla
  // Meta: se enseña su mensaje en vez de uno genérico.
  const manageCampaign = useCallback(async (campaignId, action) => {
    if (!campaignId) return
    setManagingCampaign(true)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${campaignId}/${action}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || t('ads.overview.metaFailed'))
      const labels = { publish: t('ads.overview.published'), activate: t('ads.overview.activated'), pause: t('ads.overview.paused') }
      // Se enseñan todos los avisos de publicación, no solo el primero: cada
      // uno es una cosa distinta que revisar (píxel, página, presupuesto…).
      const warningList = action === 'publish' && Array.isArray(body?.warnings) ? body.warnings.filter(Boolean) : []
      const warnings = warningList.length ? ` ${t('ads.overview.warnings', { list: warningList.join(' · ') })}` : ''
      showNotice(labels[action] + warnings)
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || t('ads.overview.metaFailed'))
    } finally {
      setManagingCampaign(false)
    }
  }, [loadOverview, showNotice, t])

  // Experimentos: crear (borrador), arrancar y concluir. Concluir puede
  // devolver "sin conclusión", que es un resultado válido y se enseña tal cual.
  const [busyExperiment, setBusyExperiment] = useState('')
  const createExperiment = useCallback(async payload => {
    setBusyExperiment('new')
    try {
      const response = await apiFetch('/api/ads/experiments', { method: 'POST', body: JSON.stringify(payload) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.issues?.[0]?.message || body?.error || t('ads.overview.experimentCreateFailed'))
      showNotice(t('ads.overview.experimentCreated'))
      await loadOverview()
      return body
    } catch (error) {
      showNotice(error?.message || t('ads.overview.experimentCreateFailed'))
      return null
    } finally {
      setBusyExperiment('')
    }
  }, [loadOverview, showNotice, t])

  const changeExperiment = useCallback(async (experimentId, verb) => {
    setBusyExperiment(experimentId)
    try {
      const response = await apiFetch(`/api/ads/experiments/${experimentId}/${verb}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'experiment-failed')
      showNotice(verb === 'start' ? t('ads.overview.experimentStarted') : (body?.conclusion || t('ads.overview.experimentConcluded')))
      await loadOverview()
    } catch (error) {
      showNotice(error?.message === 'experiment-failed' ? t('ads.overview.experimentUpdateFailed') : error?.message)
    } finally {
      setBusyExperiment('')
    }
  }, [loadOverview, showNotice, t])

  const syncCampaign = useCallback(async campaignId => {
    if (!campaignId) return
    setManagingCampaign(true)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${campaignId}/remote-status`)
      if (!response.ok) throw new Error('remote-status-failed')
      showNotice(t('ads.overview.remoteSynced'))
      await loadOverview()
    } catch {
      showNotice(t('ads.overview.remoteSyncFailed'))
    } finally {
      setManagingCampaign(false)
    }
  }, [loadOverview, showNotice, t])

  return {
    overview, loading, dataStatus, dataError,
    pendingActions, rules, experiments,
    notice, showNotice,
    decidingId, busyRule, refreshingQuality, managingCampaign, busyExperiment,
    decisionsByCampaign,
    loadOverview,
    decideOnRecommendation, runAction, changeRuleAutonomy,
    toggleAutonomyStop, refreshDataQuality, manageCampaign, syncCampaign,
    createExperiment, changeExperiment,
  }
}

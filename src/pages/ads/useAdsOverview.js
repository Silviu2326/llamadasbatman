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
 * - syncCampaign(campaignId)
 */
export function useAdsOverview({ locale }) {
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
      setDataError(DEMO_MODE
        ? 'El modo demo está habilitado, pero Ads no usa datos simulados: conecta Meta para ver información real.'
        : 'No se pudo conectar con la operación de Ads. Revisa el backend y vuelve a intentarlo.')
    } finally { setLoading(false) }
  }, [locale])

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
      showNotice(verb === 'approve' ? 'Acción aprobada y registrada como pendiente.' : 'Recomendación rechazada con tu motivo.')
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || 'No se pudo registrar la decisión.')
    } finally {
      setDecidingId('')
    }
  }, [loadOverview, showNotice])

  // Ejecutar revalida los guardarraíles en el servidor: si algo cambió desde
  // la aprobación, devuelve 409 con el motivo concreto y no toca Meta.
  const runAction = useCallback(async (actionId, verb = 'execute') => {
    setDecidingId(actionId)
    try {
      const response = await apiFetch(`/api/ads/actions/${actionId}/${verb}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'action-failed')
      showNotice(verb === 'execute' ? 'Acción ejecutada y estado remoto comprobado.' : 'Acción deshecha.')
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || 'No se pudo completar la acción.')
    } finally {
      setDecidingId('')
    }
  }, [loadOverview, showNotice])

  // Promover amplía lo que el sistema hace solo, así que el servidor vuelve a
  // comprobar que la regla se lo ha ganado y devuelve 409 con lo que falta.
  const changeRuleAutonomy = useCallback(async (ruleKey, verb) => {
    setBusyRule(ruleKey)
    try {
      const response = await apiFetch(`/api/ads/rules/${ruleKey}/${verb}`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.blockers?.join(' ') || body?.error || 'rule-failed')
      showNotice(verb === 'promote' ? 'Regla promocionada.' : 'Regla devuelta a N1.')
      await loadOverview()
    } catch (error) {
      showNotice(error?.message || 'No se pudo cambiar la autonomía de la regla.')
    } finally {
      setBusyRule('')
    }
  }, [loadOverview, showNotice])

  const toggleAutonomyStop = useCallback(async stop => {
    try {
      const response = await apiFetch('/api/ads/policy/stop', {
        method: 'POST',
        body: JSON.stringify(stop ? { reason: 'Parada solicitada desde la página de Ads' } : { resume: true }),
      })
      if (!response.ok) throw new Error('stop-failed')
      showNotice(stop ? 'Autonomía parada.' : 'Autonomía reanudada.')
      await loadOverview()
    } catch {
      showNotice('No se pudo cambiar el estado de la autonomía.')
    }
  }, [loadOverview, showNotice])

  // Recomprueba permisos, frescura, atribución y consentimiento sin esperar a
  // que caduque la caché del último diagnóstico.
  const refreshDataQuality = useCallback(async () => {
    setRefreshingQuality(true)
    try {
      const response = await apiFetch('/api/ads/data-quality/refresh', { method: 'POST' })
      if (!response.ok) throw new Error('data-quality-failed')
      await loadOverview()
    } catch {
      showNotice('No se pudo recomprobar la integridad de los datos.')
    } finally {
      setRefreshingQuality(false)
    }
  }, [loadOverview, showNotice])

  const manageCampaign = useCallback(async (campaignId, action) => {
    if (!campaignId) return
    setManagingCampaign(true)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${campaignId}/${action}`, { method: 'POST' })
      if (!response.ok) throw new Error('meta-action-failed')
      const labels = { publish: 'Borrador enviado a Meta.', activate: 'Campaña activada.', pause: 'Campaña pausada.' }
      showNotice(labels[action])
      await loadOverview()
    } catch {
      showNotice('Meta no pudo completar la operación. Revisa la cuenta y vuelve a intentarlo.')
    } finally {
      setManagingCampaign(false)
    }
  }, [loadOverview, showNotice])

  const syncCampaign = useCallback(async campaignId => {
    if (!campaignId) return
    setManagingCampaign(true)
    try {
      const response = await apiFetch(`/api/ads/campaigns/${campaignId}/remote-status`)
      if (!response.ok) throw new Error('remote-status-failed')
      showNotice('Estado de Meta actualizado.')
      await loadOverview()
    } catch {
      showNotice('No se pudo sincronizar el estado con Meta.')
    } finally {
      setManagingCampaign(false)
    }
  }, [loadOverview, showNotice])

  return {
    overview, loading, dataStatus, dataError,
    pendingActions, rules, experiments,
    notice, showNotice,
    decidingId, busyRule, refreshingQuality, managingCampaign,
    decisionsByCampaign,
    loadOverview,
    decideOnRecommendation, runAction, changeRuleAutonomy,
    toggleAutonomyStop, refreshDataQuality, manageCampaign, syncCampaign,
  }
}

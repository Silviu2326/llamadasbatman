import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'

// La selección sobrevive a la navegación (URL compartible) y a la sesión
// (localStorage), pero la URL manda: un enlace con ?campaign= abre esa campaña.
const STORAGE_KEY = 'vendrava.ads.campaign'

/**
 * Selección de campaña global y su plan de activación publicitaria
 * (`/api/ads/plan`): activaciones por plataforma, audiencias, briefs y
 * creatividades, con sus mutaciones.
 *
 * Devuelve:
 * - campaigns, campaignsLoading           // campañas globales para el selector
 * - selectedId, selectCampaign(id|null)   // sincronizado con ?campaign=
 * - selectedCampaign                      // entrada de `campaigns` seleccionada
 * - plan, planLoading, planError, reloadPlan()
 * - busyId                                // id de la entidad en mutación ('new' al crear)
 * - createActivation(body) / updateActivation(id, body)
 * - saveAudience(body, id?) / archiveAudience(id)
 * - saveBrief(body, id?) / setBriefStatus(id, status)
 * - createCreative(body) / updateCreative(id, body)
 * - submitCreative(id) / approveCreative(id) / rejectCreative(id, reason)
 *
 * Todas las mutaciones devuelven el cuerpo de la respuesta o null si fallaron
 * (el error ya se ha notificado); tras el éxito recargan el plan.
 */
export function useAdsPlan({ enabled = true, notify, t }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState('')
  const [busyId, setBusyId] = useState('')
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const urlCampaign = searchParams.get('campaign')
  const [selectedId, setSelectedId] = useState(() => urlCampaign || window.localStorage.getItem(STORAGE_KEY) || null)

  // URL → estado: un enlace profundo con ?campaign= gana a lo recordado.
  useEffect(() => {
    if (urlCampaign && urlCampaign !== selectedId) setSelectedId(urlCampaign)
  }, [urlCampaign, selectedId])

  // Estado → URL: la selección restaurada de localStorage también se escribe
  // en la URL, para que cualquier enlace copiado lleve la campaña consigo.
  // Solo cuando la URL no trae campaña: si la trae, la URL manda (efecto
  // anterior) y escribir aquí ganaría la carrera con el estado viejo.
  useEffect(() => {
    if (!selectedId || urlCampaign) return
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.set('campaign', selectedId)
      return next
    }, { replace: true })
  }, [selectedId, urlCampaign, setSearchParams])

  const selectCampaign = useCallback(id => {
    setSelectedId(id || null)
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id)
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch { /* almacenamiento bloqueado: la selección solo dura la sesión */ }
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (id) next.set('campaign', id)
      else next.delete('campaign')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const [campaignsFailed, setCampaignsFailed] = useState(false)
  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    try {
      const response = await apiFetch('/api/ads/global-campaigns')
      if (!response.ok) throw new Error('campaigns-failed')
      const data = await response.json()
      setCampaigns(Array.isArray(data?.campaigns) ? data.campaigns : [])
      setCampaignsFailed(false)
    } catch {
      setCampaigns([])
      setCampaignsFailed(true)
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  useEffect(() => { if (enabled) loadCampaigns() }, [enabled, loadCampaigns])

  // Una selección recordada puede apuntar a una campaña borrada (o de otra
  // org): se descarta en cuanto la lista real llega — también cuando la lista
  // llega vacía — para no dejar la página pidiendo un plan 404. Si la petición
  // falló, la lista vacía no prueba nada y la selección se conserva.
  useEffect(() => {
    if (!campaignsLoading && !campaignsFailed && selectedId && !campaigns.some(c => c.id === selectedId)) {
      selectCampaign(null)
    }
  }, [campaignsLoading, campaignsFailed, campaigns, selectedId, selectCampaign])

  const reloadPlan = useCallback(async () => {
    if (!selectedId) { setPlan(null); return }
    setPlanLoading(true)
    setPlanError('')
    try {
      const response = await apiFetch(`/api/ads/plan?campaignId=${encodeURIComponent(selectedId)}`)
      if (!response.ok) throw new Error('plan-failed')
      setPlan(await response.json())
    } catch {
      setPlan(null)
      setPlanError(t('ads.plan.loadError'))
    } finally {
      setPlanLoading(false)
    }
  }, [selectedId, t])

  useEffect(() => { if (enabled) reloadPlan() }, [enabled, reloadPlan])

  const mutate = useCallback(async (path, { method = 'POST', body, busy = 'new', okMessage } = {}) => {
    setBusyId(busy)
    try {
      const response = await apiFetch(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'request-failed')
      if (okMessage) notifyRef.current?.(okMessage)
      await reloadPlan()
      return data
    } catch (error) {
      notifyRef.current?.(error?.message || t('ads.common.operationFailed'))
      return null
    } finally {
      setBusyId('')
    }
  }, [reloadPlan, t])

  const createActivation = useCallback(body =>
    mutate('/api/ads/activations', { body, okMessage: t('ads.plan.activationCreated') }), [mutate, t])
  const updateActivation = useCallback((id, body) =>
    mutate(`/api/ads/activations/${id}`, { method: 'PUT', body, busy: id, okMessage: t('ads.plan.activationUpdated') }), [mutate, t])

  const saveAudience = useCallback((body, id) => (id
    ? mutate(`/api/ads/audiences/${id}`, { method: 'PUT', body, busy: id, okMessage: t('ads.plan.audienceUpdated') })
    : mutate('/api/ads/audiences', { body, okMessage: t('ads.plan.audienceCreated') })), [mutate, t])
  const archiveAudience = useCallback(id =>
    mutate(`/api/ads/audiences/${id}/archive`, { busy: id, okMessage: t('ads.plan.audienceArchived') }), [mutate, t])

  const saveBrief = useCallback((body, id) => (id
    ? mutate(`/api/ads/briefs/${id}`, { method: 'PUT', body, busy: id, okMessage: t('ads.plan.briefUpdated') })
    : mutate('/api/ads/briefs', { body, okMessage: t('ads.plan.briefCreated') })), [mutate, t])
  const setBriefStatus = useCallback((id, status) =>
    mutate(`/api/ads/briefs/${id}/status`, { body: { status }, busy: id }), [mutate])

  const createCreative = useCallback(body =>
    mutate('/api/ads/creatives', { body, okMessage: t('ads.plan.creativeSaved') }), [mutate, t])
  const updateCreative = useCallback((id, body) =>
    mutate(`/api/ads/creatives/${id}`, { method: 'PUT', body, busy: id, okMessage: t('ads.plan.creativeUpdated') }), [mutate, t])
  const submitCreative = useCallback(id =>
    mutate(`/api/ads/creatives/${id}/submit`, { busy: id, okMessage: t('ads.plan.creativeSubmitted') }), [mutate, t])
  const approveCreative = useCallback(id =>
    mutate(`/api/ads/creatives/${id}/approve`, { busy: id, okMessage: t('ads.plan.creativeApproved') }), [mutate, t])
  const rejectCreative = useCallback((id, reason) =>
    mutate(`/api/ads/creatives/${id}/reject`, { body: { reason }, busy: id, okMessage: t('ads.plan.creativeRejected') }), [mutate, t])

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedId) ?? null,
    [campaigns, selectedId],
  )

  return {
    campaigns, campaignsLoading,
    selectedId, selectCampaign, selectedCampaign,
    plan, planLoading, planError, reloadPlan,
    busyId,
    createActivation, updateActivation,
    saveAudience, archiveAudience,
    saveBrief, setBriefStatus,
    createCreative, updateCreative, submitCreative, approveCreative, rejectCreative,
  }
}

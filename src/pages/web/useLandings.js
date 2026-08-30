import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { FALLBACK_IMAGES, getLink, normalizeCampaign, readExternalWebs, writeExternalWebs } from './landingModel'

/**
 * Landings: listado (campañas con landing + webs externas), telemetría,
 * atención requerida, ranking económico, detalle con variantes, experimentos,
 * autonomía e informe en euros.
 *
 * La telemetría es accesoria para el listado: si su petición falla, las
 * landings se siguen mostrando sin métricas inventadas.
 */
export function useLandings({ notify, initialLandingKey = '', initialCampaignId = '' }) {
  const [campaigns, setCampaigns] = useState([])
  const [items, setItems] = useState([])
  const [externalWebs, setExternalWebs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [integrity, setIntegrity] = useState(null)
  const [telemetryRead, setTelemetryRead] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [attention, setAttention] = useState([])
  const [performance, setPerformance] = useState([])
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [variants, setVariants] = useState([])
  const [experiment, setExperiment] = useState(null)
  const [variantBusy, setVariantBusy] = useState(false)
  const [autonomy, setAutonomy] = useState(null)
  const [report, setReport] = useState(null)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  // Los enlaces profundos se resuelven una sola vez, al cargar.
  const deepLink = useRef({ landingKey: initialLandingKey, campaignId: initialCampaignId })

  const loadVariants = useCallback(async landingKey => {
    const response = await apiFetch(`/api/landings/variants?landingKey=${encodeURIComponent(landingKey)}`)
    if (!response.ok) return
    const data = await response.json()
    setVariants(data.items || [])
    // Solo hay un experimento activo por landing (§10).
    const active = (data.items || []).find(variant => variant.status === 'active' && variant.experimentId)
    if (!active) return setExperiment(null)
    const results = await apiFetch(`/api/landings/experiments/${active.experimentId}`)
    setExperiment(results.ok ? await results.json() : null)
  }, [])

  const openDetail = useCallback(async landingKey => {
    if (!landingKey) return notify?.('Esta landing todavía no tiene telemetría')
    setDetail(null)
    setVariants([])
    setExperiment(null)
    setDetailLoading(true)
    try {
      const response = await apiFetch(`/api/landings/${landingKey}`)
      if (!response.ok) throw new Error('No se pudo cargar el detalle de la landing')
      setDetail(await response.json())
      // Variantes, autonomía e informe son lecturas independientes.
      await Promise.all([
        loadVariants(landingKey),
        apiFetch(`/api/landings/autonomy?landingKey=${encodeURIComponent(landingKey)}`).then(res => (res.ok ? res.json() : null)).then(setAutonomy).catch(() => setAutonomy(null)),
        apiFetch(`/api/landings/report/${encodeURIComponent(landingKey)}`).then(res => (res.ok ? res.json() : null)).then(setReport).catch(() => setReport(null)),
      ])
    } catch (error) {
      notify?.(error.message)
    } finally {
      setDetailLoading(false)
    }
  }, [loadVariants, notify])

  function closeDetail() {
    setDetail(null)
    setDetailLoading(false)
    setVariants([])
    setExperiment(null)
    setAutonomy(null)
    setReport(null)
  }

  const loadLandings = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [response, landingsResponse] = await Promise.all([
        apiFetch('/api/campaigns?limit=100'),
        apiFetch('/api/landings/overview').catch(() => ({ ok: false })),
      ])
      if (!response.ok) throw new Error('No se pudieron cargar las campañas')
      const data = await response.json()
      if (!Array.isArray(data?.items)) throw new Error('La respuesta de campañas no tiene el formato esperado')
      const landingsData = landingsResponse.ok ? await landingsResponse.json() : null
      const telemetryByCampaign = new Map((landingsData?.items || []).map(item => [item.campaignId, item]))
      setTelemetryRead(Boolean(landingsData))
      setIntegrity(landingsData?.integrity ?? null)
      setAttention(landingsData?.attention ?? [])
      // El ranking llega ordenado por el backend: quién produce compradores no
      // lo decide el orden de creación.
      const order = new Map((landingsData?.ranking || []).map((campaignId, index) => [campaignId, index]))
      setPerformance((landingsData?.items || []).filter(item => item.snapshot).sort((a, b) => (order.get(a.campaignId) ?? 999) - (order.get(b.campaignId) ?? 999)))
      setCampaigns(data.items)
      setItems(data.items.map((campaign, index) => {
        const telemetry = telemetryByCampaign.get(campaign.id)
        return normalizeCampaign({
          ...campaign,
          trackedVisits: telemetry?.snapshot?.visits ?? undefined,
          snapshotLeads: telemetry?.snapshot?.leads ?? null,
          telemetryState: telemetry?.telemetry ?? 'pending',
          landingKey: telemetry?.landingKey ?? null,
        }, index)
      }))
      // Enlaces profundos: desde Ads se conoce el id de campaña, no la
      // `landingKey`, así que se resuelve aquí con los datos ya cargados.
      const wanted = deepLink.current
      deepLink.current = { landingKey: '', campaignId: '' }
      if (wanted.landingKey) openDetail(wanted.landingKey)
      else if (wanted.campaignId) {
        const match = (landingsData?.items || []).find(item => item.campaignId === wanted.campaignId)
        if (match?.landingKey) openDetail(match.landingKey)
        else notify?.('Esa campaña todavía no tiene landing con telemetría')
      }
    } catch (error) {
      setItems([])
      setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las campañas')
    } finally {
      setLoading(false)
    }
  }, [notify, openDetail])

  useEffect(() => {
    setExternalWebs(readExternalWebs())
    loadLandings()
  }, [loadLandings])

  const allItems = useMemo(() => [...items, ...externalWebs], [externalWebs, items])

  const metrics = useMemo(() => {
    const published = allItems.filter(item => item.status === 'published').length
    const campaignItems = allItems.filter(item => !item.external)
    const trackedItems = campaignItems.filter(item => item.slug && Number.isFinite(item.visits))
    const visits = trackedItems.reduce((total, item) => total + item.visits, 0)
    const trackedLeads = trackedItems.reduce((total, item) => total + item.leads, 0)
    const leads = campaignItems.reduce((total, item) => total + item.leads, 0)
    const meetings = campaignItems.reduce((total, item) => total + item.meetings, 0)
    const conversion = visits > 0 ? (trackedLeads / visits) * 100 : null
    const landingItems = campaignItems.filter(item => item.slug)
    return { published, visits, leads, meetings, conversion, trackedCount: trackedItems.length, landingCount: landingItems.length, draft: landingItems.find(item => item.status === 'draft') || null }
  }, [allItems])

  const featured = allItems.find(item => item.status === 'published') || allItems.find(item => item.slug) || allItems[0] || null

  async function runVariantAction(path, options, successMessage) {
    if (!detail) return
    setVariantBusy(true)
    try {
      const response = await apiFetch(path, { method: 'POST', ...options })
      const data = await response.json().catch(() => ({}))
      // 409 con el motivo cuando la transición no está permitida: se muestra tal cual.
      if (!response.ok) throw new Error(data.error || 'No se pudo completar la acción')
      notify?.(successMessage)
      await loadVariants(detail.landingKey)
    } catch (error) {
      notify?.(error.message)
    } finally {
      setVariantBusy(false)
    }
  }

  const variantActions = {
    generate: landingKey => runVariantAction('/api/landings/variants', { body: JSON.stringify({ landingKey }) }, 'Variante propuesta'),
    requestApproval: id => runVariantAction(`/api/landings/variants/${id}/request-approval`, {}, 'Enviada a aprobación'),
    start: id => runVariantAction(`/api/landings/variants/${id}/start`, { body: JSON.stringify({}) }, 'Experimento activado'),
    conclude: id => runVariantAction(`/api/landings/experiments/${id}/conclude`, {}, 'Experimento cerrado'),
    discard: id => runVariantAction(`/api/landings/variants/${id}/discard`, { body: JSON.stringify({}) }, 'Variante descartada'),
    runAutonomy: async () => {
      if (!detail) return
      setVariantBusy(true)
      try {
        const response = await apiFetch('/api/landings/autonomy/run', { method: 'POST' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No se pudo ejecutar la pasada')
        notify?.(data.shadowMode ? 'Pasada en sombra registrada: no se ha tocado ninguna landing' : 'Pasada de autonomía ejecutada')
        const refreshed = await apiFetch(`/api/landings/autonomy?landingKey=${encodeURIComponent(detail.landingKey)}`)
        setAutonomy(refreshed.ok ? await refreshed.json() : null)
      } catch (error) {
        notify?.(error.message)
      } finally {
        setVariantBusy(false)
      }
    },
  }

  async function refreshTelemetry() {
    setRefreshing(true)
    try {
      const response = await apiFetch('/api/landings/refresh', { method: 'POST' })
      if (!response.ok) throw new Error('No se pudo recalcular la telemetría')
      await loadLandings()
      notify?.('Telemetría recalculada')
    } catch (error) {
      notify?.(error.message)
    } finally {
      setRefreshing(false)
    }
  }

  function openItem(item) {
    if (item.external || item.slug) window.open(getLink(item), '_blank', 'noopener,noreferrer')
    else setModal({ mode: 'edit', item })
  }

  function editItem(item) {
    setModal({ mode: item.external ? 'import' : 'edit', item })
  }

  async function copyLink(item) {
    const link = getLink(item)
    if (!link) return notify?.('Añade un slug para disponer de un enlace público')
    try {
      await navigator.clipboard.writeText(link)
      notify?.('Enlace copiado al portapapeles')
    } catch {
      notify?.('No se pudo copiar el enlace')
    }
  }

  async function saveLanding(form) {
    setSaving(true)
    try {
      if (modal.mode === 'import') {
        const next = { ...modal.item, ...form, id: modal.item?.id || `external-${Date.now()}`, external: true, status: 'external', updatedAt: 'Actualizado ahora', templateId: 'generic-v1', leads: null, visits: null, meetings: null, image: FALLBACK_IMAGES[1] }
        const nextWebs = modal.item ? externalWebs.map(item => (item.id === next.id ? next : item)) : [next, ...externalWebs]
        setExternalWebs(nextWebs)
        writeExternalWebs(nextWebs)
        setModal(null)
        notify?.(modal.item ? 'Sitio web actualizado' : 'Sitio web añadido a tu espacio')
        return
      }
      const assets = { ...(modal.item?.assets || {}), title: form.name, offer: form.offer, leadMagnet: form.leadMagnet, adCopy: form.adCopy, landingTemplateId: form.templateId }
      if (modal.mode === 'create') {
        const response = await apiFetch('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: form.campaignName || form.name, objective: form.adCopy, landingSlug: form.slug, adAssets: assets }) })
        if (!response.ok) throw new Error('No se pudo crear la landing')
        const campaign = await response.json()
        const created = { ...campaign, adAssets: assets, landingSlug: form.slug }
        setCampaigns(previous => [created, ...previous])
        setItems(previous => [normalizeCampaign(created, previous.length), ...previous])
      } else if (!modal.item.external) {
        const response = await apiFetch(`/api/campaigns/${modal.item.sourceId || modal.item.id}/landing`, { method: 'PUT', body: JSON.stringify({ landingSlug: form.slug, adAssets: assets }) })
        if (!response.ok) throw new Error('No se pudo guardar la landing')
        setCampaigns(previous => previous.map(campaign => (campaign.id === modal.item.id ? { ...campaign, landingSlug: form.slug, adAssets: assets } : campaign)))
        setItems(previous => previous.map(item => (item.id === modal.item.id ? { ...item, ...form, slug: form.slug, templateId: form.templateId, assets, updatedAt: 'Actualizado ahora' } : item)))
      }
      setModal(null)
      notify?.(modal.mode === 'create' ? 'Landing creada como borrador' : 'Landing actualizada correctamente')
    } catch (error) {
      notify?.(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(item) {
    if (item.external) return notify?.('Las webs externas no permiten cambiar estado desde campañas')
    if (!item.slug) return notify?.('Añade un slug antes de publicar esta landing')
    const nextStatus = item.status === 'published' ? 'paused' : 'active'
    const response = await apiFetch(`/api/campaigns/${item.sourceId || item.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus }) })
    if (!response.ok) return notify?.('No se pudo actualizar el estado')
    setItems(previous => previous.map(current => (current.id === item.id ? { ...current, status: nextStatus === 'active' ? 'published' : 'draft' } : current)))
    setCampaigns(previous => previous.map(campaign => (campaign.id === item.id ? { ...campaign, status: nextStatus } : campaign)))
    notify?.(nextStatus === 'active' ? 'Landing publicada' : 'Landing pausada')
  }

  return {
    campaigns, items, externalWebs, allItems, loading, loadError, reload: loadLandings,
    integrity, telemetryRead, refreshing, refreshTelemetry,
    attention, performance, metrics, featured,
    detail, detailLoading, variants, experiment, variantBusy, autonomy, report, openDetail, closeDetail, variantActions,
    modal, saving, openCreate: () => setModal({ mode: 'create', item: null }), openImport: () => setModal({ mode: 'import', item: null }), closeModal: () => setModal(null), saveLanding,
    openItem, editItem, copyLink, toggleStatus,
  }
}

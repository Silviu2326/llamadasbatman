import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../i18n'
import { DEMO_MODE } from '../../lib/dataMode'
import { classifyFetchError, statusMessage } from '../../lib/dataStatus'
import { defaultObjectiveFor, generateMedia, pieceToText, rasterizeSlide, textToPiece, uploadMedia } from './contentFormats'

/**
 * Estudio de contenido: radar de oportunidades (de las conversaciones), las
 * seis piezas por oportunidad, la sala de aprobación, los resultados, el
 * libro de marca, los enlaces de aprobación externa, la conexión con Metricool
 * y el copiloto de contenido por brief.
 *
 * Metricool planifica y publica; aquí solo se prepara y se aprueba. Toda
 * acción devuelve su error por `notify` para que la página lo enseñe en el
 * mismo aviso que el resto.
 */
export function useContentStudio({ notify }) {
  const { t } = useI18n()
  // Conexión con Metricool y métricas.
  const [loadingConnection, setLoadingConnection] = useState(true)
  const [gated, setGated] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('loading')
  const [connectionError, setConnectionError] = useState('')
  const [connected, setConnected] = useState(false)
  const [providerUrl, setProviderUrl] = useState(null)
  const [integrations, setIntegrations] = useState([])
  const [connecting, setConnecting] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsStatus, setAnalyticsStatus] = useState('loading')
  const [analyticsError, setAnalyticsError] = useState('')

  // Campañas (destino de los borradores).
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignStatus, setCampaignStatus] = useState('loading')
  const [campaignError, setCampaignError] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [socialCta, setSocialCta] = useState(() => t('organic.studioHook.defaultCta'))

  // Radar → estudio → sala → resultados.
  const [radar, setRadar] = useState(null)
  const [radarLoading, setRadarLoading] = useState(true)
  const [radarBusy, setRadarBusy] = useState(false)
  const [evidence, setEvidence] = useState(null)
  const [studio, setStudio] = useState(null)
  const [studioBusy, setStudioBusy] = useState(false)
  const [studioSetup, setStudioSetup] = useState(null)
  const [studioObjective, setStudioObjective] = useState('educar')
  const [studioChannels, setStudioChannels] = useState(['instagram'])
  const [pieceImageStatus, setPieceImageStatus] = useState({})
  const [queue, setQueue] = useState([])
  const [results, setResults] = useState(null)
  const [drafts, setDrafts] = useState({})
  // Fecha de publicación elegida por pieza (datetime-local); viaja con «Aprobar todo».
  const [schedule, setSchedule] = useState({})
  const [histories, setHistories] = useState({})
  const [batchProgress, setBatchProgress] = useState(null)

  // Marca y enlaces de aprobación.
  const [brand, setBrand] = useState(null)
  const [approvalLinks, setApprovalLinks] = useState([])
  const [newApprovalLink, setNewApprovalLink] = useState(null)

  // Copiloto por brief.
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiTone, setAiTone] = useState('cercano')
  const [aiStartDate, setAiStartDate] = useState('')
  const [aiChannels, setAiChannels] = useState(['instagram', 'linkedin'])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPlan, setAiPlan] = useState(null)
  const [draftStatus, setDraftStatus] = useState({})
  const [postImages, setPostImages] = useState({})
  const [imageStatus, setImageStatus] = useState({})

  const selectedCampaign = campaigns.find(campaign => campaign.id === selectedCampaignId)

  // ── Cargas ──────────────────────────────────────────────────────────────

  const loadRadar = useCallback(async () => {
    setRadarLoading(true)
    try {
      const res = await apiFetch('/api/content/opportunities')
      setRadar(res.ok ? await res.json() : null)
    } catch {
      setRadar(null)
    } finally {
      setRadarLoading(false)
    }
  }, [])

  const loadQueueAndResults = useCallback(async () => {
    const [queueRes, resultsRes] = await Promise.all([
      apiFetch('/api/content/pieces/queue').catch(() => ({ ok: false })),
      apiFetch('/api/content/results').catch(() => ({ ok: false })),
    ])
    if (queueRes.ok) setQueue((await queueRes.json()).pieces ?? [])
    if (resultsRes.ok) setResults(await resultsRes.json())
  }, [])

  const loadBrandAndLinks = useCallback(async () => {
    const [brandRes, linksRes] = await Promise.all([
      apiFetch('/api/content/brand').catch(() => ({ ok: false })),
      apiFetch('/api/content/approval-links').catch(() => ({ ok: false })),
    ])
    if (brandRes.ok) setBrand((await brandRes.json()).brand ?? null)
    if (linksRes.ok) setApprovalLinks((await linksRes.json()).links ?? [])
  }, [])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    setAnalyticsStatus('loading')
    setAnalyticsError('')
    try {
      const res = await apiFetch('/api/metricool/analytics')
      if (!res.ok) throw new Error(`metricool_analytics_${res.status}`)
      const data = await res.json()
      setAnalytics(data)
      setAnalyticsStatus(DEMO_MODE ? 'demo' : data && Object.keys(data).length ? 'live' : 'empty')
    } catch (error) {
      setAnalytics(null)
      const status = classifyFetchError(error)
      setAnalyticsStatus(status)
      setAnalyticsError(statusMessage(status, { error: t('organic.studioHook.metricoolNoMetrics') }))
    } finally {
      setAnalyticsLoading(false)
    }
  }, [])

  const loadConnection = useCallback(async () => {
    setLoadingConnection(true)
    setConnectionStatus('loading')
    setConnectionError('')
    try {
      const res = await apiFetch('/api/metricool')
      if (res.status === 403) {
        setGated(true)
        setConnectionStatus('disconnected')
        return
      }
      if (!res.ok) throw new Error('status failed')
      const data = await res.json()
      setConnected(Boolean(data.connected))
      setProviderUrl(data.appUrl ?? null)
      setIntegrations(Array.isArray(data.integrations) ? data.integrations : [])
      setConnectionStatus(DEMO_MODE ? 'demo' : data.connected ? 'live' : 'disconnected')
      if (data.connected) loadAnalytics()
      else {
        setAnalytics(null)
        setAnalyticsStatus('empty')
      }
    } catch (error) {
      setConnected(false)
      const status = classifyFetchError(error)
      setConnectionStatus(status)
      setConnectionError(statusMessage(status, { error: t('organic.studioHook.connectionCheckFailed') }))
    } finally {
      setLoadingConnection(false)
    }
  }, [loadAnalytics])

  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    setCampaignStatus('loading')
    setCampaignError('')
    try {
      const res = await apiFetch('/api/campaigns?page=1&limit=100')
      if (!res.ok) throw new Error(`campaigns_${res.status}`)
      const data = await res.json()
      const next = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
      setCampaigns(next)
      setCampaignStatus(DEMO_MODE ? 'demo' : next.length ? 'live' : 'empty')
    } catch (error) {
      setCampaigns([])
      const status = classifyFetchError(error)
      setCampaignStatus(status)
      setCampaignError(statusMessage(status, { error: t('organic.studioHook.campaignsLoadFailed') }))
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.all([loadConnection(), loadCampaigns(), loadRadar(), loadQueueAndResults(), loadBrandAndLinks()])
  }, [loadConnection, loadCampaigns, loadRadar, loadQueueAndResults, loadBrandAndLinks])

  // ── Conexión ────────────────────────────────────────────────────────────

  async function connect() {
    setConnecting(true)
    try {
      const res = await apiFetch('/api/metricool/connect', { method: 'POST' })
      if (!res.ok) throw new Error('connect failed')
      const data = await res.json()
      setConnected(true)
      setConnectionStatus(DEMO_MODE ? 'demo' : 'live')
      setConnectionError('')
      setProviderUrl(data.appUrl ?? null)
      loadAnalytics()
      notify?.(t('organic.studioHook.metricoolConnected'))
    } catch {
      setConnectionStatus('error')
      setConnectionError(t('organic.studioHook.metricoolConnectFailed'))
      notify?.(t('organic.studioHook.metricoolConnectFailed'))
    } finally {
      setConnecting(false)
    }
  }

  // ── Radar ───────────────────────────────────────────────────────────────

  async function refreshRadar() {
    setRadarBusy(true)
    try {
      const res = await apiFetch('/api/content/opportunities/refresh', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      // 409 = falta configuración o material: estado del producto, no un fallo.
      if (!res.ok) throw new Error(data.error || t('organic.studioHook.analyzeFailed'))
      notify?.(t('organic.studioHook.analyzed', { analyzed: data.analyzed, created: data.created }))
      await loadRadar()
    } catch (error) {
      notify?.(error instanceof Error ? error.message : t('organic.studioHook.analyzeFailed'))
    } finally {
      setRadarBusy(false)
    }
  }

  async function dismissOpportunity(id) {
    const res = await apiFetch(`/api/content/opportunities/${id}/dismiss`, { method: 'POST', body: JSON.stringify({}) })
    if (!res.ok) return notify?.(t('organic.studioHook.dismissFailed'))
    setRadar(previous => previous && { ...previous, opportunities: previous.opportunities.filter(item => item.id !== id) })
  }

  async function loadEvidence(id) {
    const res = await apiFetch(`/api/content/opportunities/${id}/evidence`)
    if (!res.ok) return notify?.(t('organic.studioHook.evidenceFailed'))
    setEvidence(await res.json())
  }

  // ── Estudio ─────────────────────────────────────────────────────────────

  /** Abre el estudio con el objetivo del tipo elegido. No genera todavía. */
  function openStudio(opportunity) {
    setStudioSetup(opportunity)
    setStudio(null)
    setStudioObjective(defaultObjectiveFor(opportunity.type))
    setStudioChannels(['instagram'])
    setPieceImageStatus({})
  }

  function closeStudio() {
    setStudioSetup(null)
    setStudio(null)
  }

  function toggleStudioChannel(id) {
    setStudioChannels(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]))
  }

  async function generateCampaign() {
    if (!studioSetup || !studioChannels.length) return
    setStudioBusy(true)
    try {
      const res = await apiFetch('/api/content/pieces/generate', {
        method: 'POST',
        body: JSON.stringify({
          opportunityId: studioSetup.id,
          campaignId: selectedCampaignId || undefined,
          objective: studioObjective,
          channels: studioChannels,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('organic.studioHook.generateFailed'))
      setStudio(data)
      setPieceImageStatus({})
      await loadQueueAndResults()
    } catch (error) {
      notify?.(error instanceof Error ? error.message : t('organic.studioHook.generateFailed'))
    } finally {
      setStudioBusy(false)
    }
  }

  async function savePieceImage(pieceId, imageUrl) {
    const res = await apiFetch(`/api/content/pieces/${pieceId}/image`, { method: 'PUT', body: JSON.stringify({ imageUrl }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || t('organic.studioHook.imageSaveFailed'))
    setStudio(previous => previous && {
      ...previous,
      pieces: previous.pieces.map(piece => (piece.id === pieceId ? { ...piece, imageUrl: data.imageUrl ?? null } : piece)),
    })
    setPieceImageStatus(previous => ({ ...previous, [pieceId]: 'done' }))
  }

  function failPieceImage(pieceId, error, fallback) {
    setPieceImageStatus(previous => ({ ...previous, [pieceId]: 'error' }))
    notify?.(error instanceof Error ? error.message : fallback)
  }

  async function uploadPieceImage(pieceId, file) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) return notify?.(t('organic.studioHook.imageTooBig'))
    setPieceImageStatus(previous => ({ ...previous, [pieceId]: 'uploading' }))
    try {
      await savePieceImage(pieceId, await uploadMedia(file))
    } catch (error) {
      failPieceImage(pieceId, error, t('organic.studioHook.imageUploadFailed'))
    }
  }

  /** La portada del carrusel maquetado como imagen de la pieza: es la que se ve en el feed. */
  async function useSlideAsImage(piece) {
    const slide = piece.body?.slideImages?.[0]
    if (!slide) return
    setPieceImageStatus(previous => ({ ...previous, [piece.id]: 'uploading' }))
    try {
      await savePieceImage(piece.id, await uploadMedia(await rasterizeSlide(slide)))
    } catch (error) {
      failPieceImage(piece.id, error, t('organic.studioHook.slideFailed'))
    }
  }

  async function generatePieceImage(piece) {
    setPieceImageStatus(previous => ({ ...previous, [piece.id]: 'generating' }))
    try {
      // El generador acepta 2.000 caracteres; el brief útil está al principio.
      await savePieceImage(piece.id, await generateMedia(pieceToText(piece).slice(0, 1500)))
    } catch (error) {
      failPieceImage(piece.id, error, t('organic.studioHook.imageGenerateFailed'))
    }
  }

  async function removePieceImage(pieceId) {
    setPieceImageStatus(previous => ({ ...previous, [pieceId]: 'removing' }))
    try {
      await savePieceImage(pieceId, null)
    } catch (error) {
      failPieceImage(pieceId, error, t('organic.studioHook.imageRemoveFailed'))
    }
  }

  // ── Sala de aprobación ──────────────────────────────────────────────────

  async function pieceAction(path, options, successMessage) {
    const res = await apiFetch(path, { method: 'POST', ...options })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      notify?.(data.error || t('organic.studioHook.actionFailed'))
      return false
    }
    if (successMessage) notify?.(successMessage)
    return true
  }

  /** Historial bajo demanda: hasta 200 líneas por pieza, y la cola enseña 60. */
  async function loadHistory(id) {
    const res = await apiFetch(`/api/content/pieces/${id}/history`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return notify?.(data.error || t('organic.studioHook.historyFailed'))
    setHistories(previous => ({ ...previous, [id]: data }))
  }

  async function commentPiece(id, message) {
    setStudioBusy(true)
    const res = await apiFetch(`/api/content/pieces/${id}/comment`, { method: 'POST', body: JSON.stringify({ message }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setHistories(previous => ({ ...previous, [id]: data }))
      await loadQueueAndResults()
    } else notify?.(data.error || t('organic.studioHook.commentFailed'))
    setStudioBusy(false)
  }

  async function submitPiece(id) {
    setStudioBusy(true)
    if (await pieceAction(`/api/content/pieces/${id}/submit`, {}, t('organic.studioHook.submitted'))) {
      setStudio(previous => previous && {
        ...previous,
        pieces: previous.pieces.map(piece => (piece.id === id ? { ...piece, status: 'pending_approval' } : piece)),
      })
      await loadQueueAndResults()
    }
    setStudioBusy(false)
  }

  async function savePieceEdit(piece) {
    const text = drafts[piece.id]
    if (text === undefined) return
    setStudioBusy(true)
    const res = await apiFetch(`/api/content/pieces/${piece.id}`, { method: 'PUT', body: JSON.stringify({ body: textToPiece(piece, text) }) })
    if (!res.ok) notify?.(t('organic.studioHook.editFailed'))
    else {
      notify?.(t('organic.studioHook.editSaved'))
      setDrafts(previous => { const next = { ...previous }; delete next[piece.id]; return next })
      await loadQueueAndResults()
    }
    setStudioBusy(false)
  }

  async function approvePiece(id) {
    setStudioBusy(true)
    if (await pieceAction(`/api/content/pieces/${id}/approve`, {}, t('organic.studioHook.approved'))) await loadQueueAndResults()
    setStudioBusy(false)
  }

  async function rejectPiece(id, reason, comment) {
    setStudioBusy(true)
    if (await pieceAction(`/api/content/pieces/${id}/reject`, { body: JSON.stringify({ reason, comment }) }, t('organic.studioHook.rejected'))) await loadQueueAndResults()
    setStudioBusy(false)
  }

  /** Aprueba en lote y crea los borradores en Metricool; informa pieza a pieza. */
  async function approveAll() {
    const pending = queue.filter(piece => piece.status === 'pending_approval')
    if (!pending.length) return
    setStudioBusy(true)
    setBatchProgress({ done: 0, total: pending.length })
    try {
      const scheduledAt = Object.fromEntries(pending
        .filter(piece => schedule[piece.id])
        .map(piece => [piece.id, new Date(schedule[piece.id]).toISOString()]))
      const res = await apiFetch('/api/content/pieces/approve-all', { method: 'POST', body: JSON.stringify({ pieceIds: pending.map(piece => piece.id), scheduledAt }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('organic.studioHook.batchFailed'))
      setBatchProgress({ done: data.approved, total: data.total })
      const blocked = data.results?.find(result => result.approved && !result.drafted)
      notify?.(blocked ? t('organic.studioHook.batchBlocked', { approved: data.approved, drafted: data.drafted, reason: blocked.reason }) : t('organic.studioHook.batchDone', { approved: data.approved, drafted: data.drafted }))
    } catch (error) {
      notify?.(error instanceof Error ? error.message : t('organic.studioHook.batchFailed'))
    } finally {
      setBatchProgress(null)
      setStudioBusy(false)
      await loadQueueAndResults()
    }
  }

  // ── Marca y enlaces ─────────────────────────────────────────────────────

  async function saveBrand(next) {
    const res = await apiFetch('/api/content/brand', { method: 'PUT', body: JSON.stringify(next) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return notify?.(data.error || t('organic.studioHook.brandFailed'))
    setBrand(data.brand)
    notify?.(t('organic.studioHook.brandSaved'))
  }

  async function createApprovalLink() {
    const res = await apiFetch('/api/content/approval-links', { method: 'POST', body: JSON.stringify({}) })
    const data = await res.json().catch(() => ({}))
    // El 409 aquí es el plan: el enlace de cliente es del plan Agency.
    if (!res.ok) return notify?.(data.error || t('organic.studioHook.linkFailed'))
    setNewApprovalLink(data)
    await loadBrandAndLinks()
  }

  async function revokeApprovalLink(id) {
    const res = await apiFetch(`/api/content/approval-links/${id}`, { method: 'DELETE' })
    if (!res.ok) return notify?.(t('organic.studioHook.revokeFailed'))
    setNewApprovalLink(null)
    await loadBrandAndLinks()
    notify?.(t('organic.studioHook.linkRevoked'))
  }

  // ── Copiloto por brief ──────────────────────────────────────────────────

  function toggleAiChannel(id) {
    setAiChannels(previous => (previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]))
  }

  async function generatePlan(event) {
    event?.preventDefault?.()
    if (!aiPrompt.trim() || !aiChannels.length) return
    setAiLoading(true)
    try {
      const res = await apiFetch('/api/metricool/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt.trim(), channels: aiChannels, tone: aiTone, startDate: aiStartDate || undefined }),
      })
      if (!res.ok) throw new Error('generate failed')
      setAiPlan(await res.json())
      setDraftStatus({})
      setPostImages({})
      setImageStatus({})
    } catch {
      notify?.(t('organic.studioHook.planFailed'))
    } finally {
      setAiLoading(false)
    }
  }

  async function uploadPostImage(file, index) {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) return notify?.(t('organic.studioHook.imageTooBig'))
    setImageStatus(previous => ({ ...previous, [index]: 'uploading' }))
    try {
      const imageUrl = await uploadMedia(file)
      setPostImages(previous => ({ ...previous, [index]: imageUrl }))
      setImageStatus(previous => ({ ...previous, [index]: 'done' }))
    } catch (error) {
      setImageStatus(previous => ({ ...previous, [index]: 'error' }))
      notify?.(error instanceof Error ? error.message : t('organic.studioHook.imageUploadFailed'))
    }
  }

  async function generatePostImage(post, index) {
    setImageStatus(previous => ({ ...previous, [index]: 'generating' }))
    try {
      const imageUrl = await generateMedia(post.text)
      setPostImages(previous => ({ ...previous, [index]: imageUrl }))
      setImageStatus(previous => ({ ...previous, [index]: 'done' }))
    } catch (error) {
      setImageStatus(previous => ({ ...previous, [index]: 'error' }))
      notify?.(error instanceof Error ? error.message : t('organic.studioHook.imageGenerateFailed'))
    }
  }

  function removePostImage(index) {
    setPostImages(previous => ({ ...previous, [index]: undefined }))
  }

  async function createDraft(post, index) {
    if (!selectedCampaignId) return notify?.(t('organic.studioHook.selectCampaign'))
    if (!selectedCampaign?.landingSlug) return notify?.(t('organic.studioHook.campaignNeedsLanding'))
    setDraftStatus(previous => ({ ...previous, [index]: 'creating' }))
    try {
      const res = await apiFetch('/api/metricool/posts', {
        method: 'POST',
        body: JSON.stringify({
          text: post.text,
          imageUrl: (postImages[index] ?? '').trim() || undefined,
          platforms: [post.platform],
          campaignId: selectedCampaignId,
          cta: socialCta.trim() || undefined,
          scheduledAt: post.suggestedDate || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || t('organic.studioHook.draftFailed'))
      }
      setDraftStatus(previous => ({ ...previous, [index]: 'done' }))
      notify?.(t('organic.studioHook.draftCreated'))
    } catch (error) {
      setDraftStatus(previous => ({ ...previous, [index]: 'error' }))
      notify?.(error instanceof Error ? error.message : t('organic.studioHook.draftFailed'))
    }
  }

  const pendingCount = queue.filter(piece => piece.status === 'pending_approval').length

  return {
    connection: { loading: loadingConnection, gated, status: connectionStatus, error: connectionError, connected, providerUrl, integrations, connecting, connect, reload: loadConnection },
    analytics: { data: analytics, loading: analyticsLoading, status: analyticsStatus, error: analyticsError, reload: loadAnalytics },
    campaignLink: { campaigns, loading: campaignsLoading, status: campaignStatus, error: campaignError, reload: loadCampaigns, selectedCampaignId, setSelectedCampaignId, selectedCampaign, cta: socialCta, setCta: setSocialCta },
    radar: { data: radar, loading: radarLoading, busy: radarBusy, refresh: refreshRadar, dismiss: dismissOpportunity, evidence, loadEvidence, closeEvidence: () => setEvidence(null) },
    studio: {
      setup: studioSetup, data: studio, busy: studioBusy, imageStatus: pieceImageStatus,
      objective: studioObjective, setObjective: setStudioObjective, channels: studioChannels, toggleChannel: toggleStudioChannel,
      open: openStudio, close: closeStudio, generate: generateCampaign,
      submit: submitPiece, uploadImage: uploadPieceImage, generateImage: generatePieceImage, useSlide: useSlideAsImage, removeImage: removePieceImage,
    },
    approval: {
      queue, pendingCount, busy: studioBusy, progress: batchProgress, drafts, histories,
      setDraft: (id, value) => setDrafts(previous => ({ ...previous, [id]: value })),
      schedule,
      setSchedule: (id, value) => setSchedule(previous => ({ ...previous, [id]: value })),
      saveEdit: savePieceEdit, approve: approvePiece, reject: rejectPiece, approveAll, loadHistory, comment: commentPiece,
    },
    results,
    brand: { data: brand, links: approvalLinks, newLink: newApprovalLink, busy: studioBusy, save: saveBrand, createLink: createApprovalLink, revokeLink: revokeApprovalLink },
    copilot: {
      prompt: aiPrompt, setPrompt: setAiPrompt, tone: aiTone, setTone: setAiTone, startDate: aiStartDate, setStartDate: setAiStartDate,
      channels: aiChannels, toggleChannel: toggleAiChannel, loading: aiLoading, plan: aiPlan, clearPlan: () => setAiPlan(null), generate: generatePlan,
      draftStatus, postImages, imageStatus, uploadImage: uploadPostImage, generateImage: generatePostImage, removeImage: removePostImage, createDraft,
    },
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../../lib/api'

async function readJson(response, fallbackError) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error || fallbackError)
  return body
}

function hostnameOf(url) {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function daysSince(iso) {
  const at = new Date(iso).getTime()
  if (!Number.isFinite(at)) return null
  return Math.floor((Date.now() - at) / 86_400_000)
}

/**
 * SEO: el último informe guardado, los proyectos vigilados por el worker, el
 * historial de score, Search Console, la serie de posiciones, el plan de
 * contenidos y la competencia.
 *
 * El informe se lee de `SeoReport` (nunca del navegador) y todo se pide
 * acotado a la URL del proyecto: sin el filtro el historial mezclaba tu score
 * con el de tus competidores.
 *
 * Las campañas con landing llegan de fuera (`landingCampaigns`): la página ya
 * las carga para el listado de landings y no tiene sentido pedirlas dos veces.
 */
export function useSeo({ landingCampaigns, targetUrl, externalReport }) {
  const [form, setForm] = useState({ url: '', business: '', sector: '', city: '' })
  const [competitorUrls, setCompetitorUrls] = useState(['', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [report, setReport] = useState(null)
  const [reportId, setReportId] = useState('')
  // `null` mientras se pregunta: sin esto la pantalla enseñaría el vacío un instante.
  const [reportLoading, setReportLoading] = useState(true)
  const [openingReportId, setOpeningReportId] = useState('')
  const [projects, setProjects] = useState([])

  const [history, setHistory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [searchConsole, setSearchConsole] = useState(null)
  const [ranks, setRanks] = useState(null)

  const [competitors, setCompetitors] = useState(null)
  const [competitorsLoading, setCompetitorsLoading] = useState(false)
  const [competitorsError, setCompetitorsError] = useState('')

  const [contentState, setContentState] = useState({})
  const [landingApply, setLandingApply] = useState({ campaignId: '', saving: false, done: '', error: '' })
  // Webs del cliente con WordPress + plugin Vendrava Connect: ahí el título y
  // la meta se aplican directamente en la página real, no solo en la landing.
  const [wordpress, setWordpress] = useState({ connections: [], connectionId: '', pages: [], pagesLoading: false, pageId: '', saving: false, done: '', error: '' })
  // Webs de código con repositorio conectado: el título y la meta llegan como
  // pull request que el cliente revisa y fusiona.
  const [git, setGit] = useState({ connections: [], connectionId: '', saving: false, done: '', error: '' })
  const [adsState, setAdsState] = useState({ saving: false, error: '' })
  const [share, setShare] = useState({ loading: false, url: '', error: '' })
  const [magnetCampaignId, setMagnetCampaignId] = useState('')
  const [gap, setGap] = useState({ loading: false, items: null, error: '' })
  const [cannibal, setCannibal] = useState({ loading: false, items: null, error: '' })
  const [stale, setStale] = useState([])
  const [staleState, setStaleState] = useState({})

  const reportUrl = report?.url ?? ''
  const appliedExternalReport = useRef('')

  const applyReport = useCallback((data, id) => {
    setReport(data)
    setReportId(id ?? data?.reportId ?? '')
    setContentState({})
    setForm(prev => ({ ...prev, url: data?.url || prev.url }))
  }, [])

  const loadProjects = useCallback((signal) => apiFetch('/api/seo/projects', signal ? { signal } : undefined)
    .then(response => readJson(response, 'No se pudieron cargar los proyectos'))
    .then(body => setProjects(Array.isArray(body.data) ? body.data : []))
    .catch(() => {}), [])

  // El último informe guardado es el estado inicial.
  useEffect(() => {
    const controller = new AbortController()
    if (targetUrl !== undefined) { setReportLoading(false); return () => controller.abort() }
    apiFetch('/api/seo/reports/latest', { signal: controller.signal })
      .then(response => readJson(response, 'No se pudo cargar el último informe'))
      .then(body => { if (body?.data) applyReport(body.data, body.data.reportId) })
      .catch(() => {})
      .finally(() => setReportLoading(false))
    return () => controller.abort()
  }, [applyReport, targetUrl])

  useEffect(() => {
    const controller = new AbortController()
    loadProjects(controller.signal)
    return () => controller.abort()
  }, [loadProjects])

  useEffect(() => {
    if (targetUrl === undefined) return
    const project = projects.find(item => item.url === targetUrl)
    setForm({ url: targetUrl, business: project?.business || '', sector: project?.sector || '', city: project?.city || '' })
    setCompetitorUrls([...(project?.competitors || []), '', '', ''].slice(0, 3))
    appliedExternalReport.current = ''; setReport(null); setReportId(''); setCompetitors(null); setContentState({}); setSearchConsole(null)
    setGap({ loading: false, items: null, error: '' }); setError('')
    setGit(prev => ({ ...prev, connectionId: '', done: '', error: '' }))
    setWordpress(prev => ({ ...prev, connectionId: '', pages: [], pageId: '', done: '', error: '' }))
  }, [targetUrl])

  useEffect(() => {
    if (targetUrl === undefined || externalReport?.url !== targetUrl) return
    const key = targetUrl + ':' + (externalReport.reportId || externalReport.generatedAt || '')
    if (appliedExternalReport.current === key) return
    appliedExternalReport.current = key
    applyReport(externalReport)
  }, [targetUrl, externalReport, applyReport])

  // El contexto del negocio vive en `SeoProject`, no en el informe: al
  // recargar se perdía y de él dependen snippets, schema y prompts.
  useEffect(() => {
    if (!projects.length) return
    const project = projects.find(p => p.url === (targetUrl ?? reportUrl)) ?? ((targetUrl ?? reportUrl) ? null : projects[0])
    if (!project) return
    setForm(prev => ({
      url: prev.url || project.url,
      business: prev.business || project.business || '',
      sector: prev.sector || project.sector || '',
      city: prev.city || project.city || '',
    }))
    setCompetitorUrls(prev => (prev.some(Boolean) ? prev : [...(project.competitors ?? []), '', '', ''].slice(0, 3)))
  }, [projects, reportUrl, targetUrl])

  useEffect(() => {
    if (!reportUrl) {
      setHistory([])
      setAlerts([])
      return undefined
    }
    const controller = new AbortController()
    apiFetch(`/api/seo/history?url=${encodeURIComponent(reportUrl)}`, { signal: controller.signal })
      .then(response => readJson(response, 'No se pudo cargar el historial'))
      .then(body => {
        setHistory(Array.isArray(body.data) ? body.data : [])
        setAlerts(Array.isArray(body.alerts) ? body.alerts : [])
      })
      .catch(() => {})
    return () => controller.abort()
  }, [reportUrl])

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/seo/content/stale', { signal: controller.signal })
      .then(response => readJson(response, 'No se pudo cargar el contenido caducado'))
      .then(body => setStale(Array.isArray(body.data) ? body.data : []))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!reportUrl) { setSearchConsole({ connected: false, totalQueries: 0 }); return undefined }
    const controller = new AbortController()
    const keywords = (report.keywords || []).map(k => k.keyword).join(',')
    apiFetch(`/api/seo/search-console?keywords=${encodeURIComponent(keywords)}${targetUrl ? `&url=${encodeURIComponent(targetUrl)}` : ''}`, { signal: controller.signal })
      .then(response => readJson(response, 'No se pudo consultar Search Console'))
      .then(body => setSearchConsole(body.data))
      .catch(() => {})
    return () => controller.abort()
  }, [report, targetUrl])

  useEffect(() => {
    if (!reportUrl) {
      setRanks(null)
      return undefined
    }
    const controller = new AbortController()
    apiFetch(`/api/seo/rank-history?url=${encodeURIComponent(reportUrl)}`, { signal: controller.signal })
      .then(response => readJson(response, 'No se pudo cargar la evolución de posiciones'))
      .then(body => setRanks(Array.isArray(body.data) ? body.data : []))
      .catch(() => setRanks([]))
    return () => controller.abort()
  }, [reportUrl])

  function setField(field) {
    return event => setForm(prev => ({ ...prev, [field]: event.target.value }))
  }

  /** Vuelve a un informe del historial. Solo lee: no re-audita nada. */
  async function openReport(id) {
    setOpeningReportId(id)
    setError('')
    try {
      const response = await apiFetch(`/api/seo/reports/${encodeURIComponent(id)}`)
      const body = await readJson(response, 'No se pudo abrir ese informe.')
      // El id se guarda aparte: compartir debe apuntar al informe que se ve.
      applyReport(body.data, id)
    } catch (openError) {
      setError(openError.message)
    } finally {
      setOpeningReportId('')
    }
  }

  /** Cambia de proyecto vigilado sin gastar una auditoría nueva. */
  async function switchProject(url) {
    if (!url) return
    const project = projects.find(p => p.url === url)
    setReportLoading(true)
    setError('')
    setSearchConsole(null)
    setCompetitors(null)
    try {
      const response = await apiFetch(`/api/seo/reports/latest?url=${encodeURIComponent(url)}`)
      const body = await readJson(response, 'No se pudo abrir ese proyecto.')
      if (body?.data) applyReport(body.data, body.data.reportId)
      else {
        setReport(null)
        setReportId('')
      }
      setForm({ url, business: project?.business || '', sector: project?.sector || '', city: project?.city || '' })
      setCompetitorUrls([...(project?.competitors ?? []), '', '', ''].slice(0, 3))
    } catch (switchError) {
      setError(switchError.message)
    } finally {
      setReportLoading(false)
    }
  }

  /** Lanza la auditoría. Devuelve true si salió bien (la página cierra el diálogo). */
  async function analyze(overrides = {}) {
    const auditForm = { ...form, ...overrides }
    if (!auditForm.url.trim()) {
      setError('Indica la URL de la web a analizar.')
      return false
    }
    setLoading(true)
    setError('')
    try {
      // Los competidores viajan con el análisis: el worker diario los audita.
      const response = await apiFetch('/api/seo/analyze', {
        method: 'POST',
        body: JSON.stringify({ ...auditForm, competitors: competitorUrls.map(u => u.trim()).filter(Boolean) }),
      })
      const body = await readJson(response, 'No se pudo generar el informe SEO.')
      applyReport(body.data, body.data?.reportId)
      loadProjects()
      return true
    } catch (analyzeError) {
      setError(analyzeError.message)
      return false
    } finally {
      setLoading(false)
    }
  }

  async function runCompare() {
    const urls = competitorUrls.map(u => u.trim()).filter(Boolean)
    if (!urls.length) {
      setCompetitorsError('Añade al menos una web de la competencia.')
      return
    }
    setCompetitorsLoading(true)
    setCompetitorsError('')
    try {
      const response = await apiFetch('/api/seo/compare', { method: 'POST', body: JSON.stringify({ urls }) })
      const body = await readJson(response, 'No se pudo comparar con la competencia.')
      setCompetitors(body.data)
    } catch (compareError) {
      setCompetitorsError(compareError.message)
    } finally {
      setCompetitorsLoading(false)
    }
  }

  function patchContent(index, patch) {
    setContentState(prev => ({ ...prev, [index]: { ...prev[index], ...patch } }))
  }

  async function writeArticle(index, item) {
    patchContent(index, { loading: true, error: '' })
    try {
      const response = await apiFetch('/api/seo/content', {
        method: 'POST',
        body: JSON.stringify({ title: item.title, keyword: item.keyword, format: item.format, business: form.business, sector: form.sector, city: form.city }),
      })
      const body = await readJson(response, 'No se pudo redactar el artículo.')
      patchContent(index, { loading: false, articleId: body.data.articleId })
    } catch (writeError) {
      patchContent(index, { loading: false, error: writeError.message })
    }
  }

  /** Publica en el blog público de la landing: sin esto el artículo no posiciona. */
  async function publishArticle(index) {
    const state = contentState[index] ?? {}
    if (!state.articleId) return
    patchContent(index, { publishing: true, error: '' })
    try {
      const response = await apiFetch(`/api/seo/content/${encodeURIComponent(state.articleId)}/publish`, { method: 'POST' })
      const body = await readJson(response, 'No se pudo publicar el artículo.')
      patchContent(index, { publishing: false, publishedSlug: body.data.slug })
    } catch (publishError) {
      patchContent(index, { publishing: false, error: publishError.message })
    }
  }

  async function shareArticle(index) {
    const state = contentState[index] ?? {}
    const platforms = state.platforms ?? []
    if (!state.articleId || !state.shareCampaignId || !platforms.length) {
      patchContent(index, { shareError: 'Elige campaña con landing y al menos una red.' })
      return
    }
    patchContent(index, { sharing: true, shareError: '' })
    try {
      const response = await apiFetch('/api/seo/social', { method: 'POST', body: JSON.stringify({ articleId: state.articleId, campaignId: state.shareCampaignId, platforms }) })
      await readJson(response, 'No se pudo programar la publicación.')
      patchContent(index, { sharing: false, shared: true, shareOpen: false })
    } catch (shareError) {
      patchContent(index, { sharing: false, shareError: shareError.message })
    }
  }

  const snippets = useMemo(() => {
    if (!report) return null
    const businessName = form.business.trim() || hostnameOf(report.url)
    const mainKeyword = report.keywords?.[0]?.keyword ?? ''
    const title = `${mainKeyword.charAt(0).toUpperCase()}${mainKeyword.slice(1)} | ${businessName}`.slice(0, 70)
    const metaDescription = (report.summary ?? '').replace(/\s+/g, ' ').slice(0, 155)
    const jsonld = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: businessName,
      url: /^https?:\/\//i.test(report.url) ? report.url : `https://${report.url}`,
      ...(form.city.trim() ? { address: { '@type': 'PostalAddress', addressLocality: form.city.trim() } } : {}),
    }, null, 2)
    return {
      title,
      metaDescription,
      html: `<title>${title}</title>\n<meta name="description" content="${metaDescription}">`,
      jsonld: `<script type="application/ld+json">\n${jsonld}\n</script>`,
    }
  }, [report, form.business, form.city])

  useEffect(() => {
    if (!report) return
    let cancelled = false
    apiFetch('/api/web-connections')
      .then(response => (response.ok ? response.json() : []))
      .then(list => {
        if (cancelled || !Array.isArray(list)) return
        const scoped = targetUrl === undefined ? list : list.filter(item => item.websiteUrl === targetUrl)
        const usable = scoped.filter(item => item.connector?.kind === 'wordpress' && item.connector.canEdit && item.connector.plugin)
        setWordpress(prev => ({ ...prev, connections: usable, connectionId: prev.connectionId || (usable.length === 1 ? usable[0].id : '') }))
        const repos = scoped.filter(item => item.connector?.kind === 'git' && item.connector.canPush)
        setGit(prev => ({ ...prev, connections: repos, connectionId: prev.connectionId || (repos.length === 1 ? repos[0].id : '') }))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [report, targetUrl])

  useEffect(() => {
    if (!wordpress.connectionId) return
    let cancelled = false
    setWordpress(prev => ({ ...prev, pagesLoading: true, pages: [], pageId: '' }))
    apiFetch(`/api/web-connections/${wordpress.connectionId}/wordpress/pages?type=pages`)
      .then(response => readJson(response, 'No se pudieron cargar las páginas de WordPress.'))
      .then(body => {
        if (cancelled) return
        const pages = Array.isArray(body.items) ? body.items : []
        // La portada suele ser la página con slug vacío o "home"/"inicio".
        const home = pages.find(page => /^(home|inicio|portada)?$/i.test(page.slug || ''))
        setWordpress(prev => ({ ...prev, pages, pagesLoading: false, pageId: home ? String(home.id) : '' }))
      })
      .catch(loadError => { if (!cancelled) setWordpress(prev => ({ ...prev, pagesLoading: false, error: loadError.message })) })
    return () => { cancelled = true }
  }, [wordpress.connectionId])

  async function applyToWordPress() {
    if (!wordpress.connectionId || !wordpress.pageId || !snippets) return
    setWordpress(prev => ({ ...prev, saving: true, error: '', done: '' }))
    try {
      const response = await apiFetch(`/api/web-connections/${wordpress.connectionId}/wordpress/pages/${wordpress.pageId}`, {
        method: 'PUT',
        body: JSON.stringify({ type: 'pages', seoTitle: snippets.title, metaDescription: snippets.metaDescription }),
      })
      const page = await readJson(response, 'WordPress no aceptó el cambio.')
      setWordpress(prev => ({ ...prev, saving: false, done: `Aplicado en ${page.link || 'la página'}`, pages: prev.pages.map(item => item.id === page.id ? { ...item, ...page } : item) }))
    } catch (applyError) {
      setWordpress(prev => ({ ...prev, saving: false, error: applyError.message }))
    }
  }

  async function applyToGit() {
    if (!git.connectionId || !snippets) return
    setGit(prev => ({ ...prev, saving: true, error: '', done: '' }))
    try {
      const instructions = [
        `Actualiza el SEO de la página de inicio de la web.`,
        `Título (<title>): "${snippets.title}".`,
        `Meta description: "${snippets.metaDescription}".`,
        'Si el proyecto genera estas etiquetas desde un archivo de configuración, layout o componente de cabecera compartido, cámbialo ahí. No modifiques nada más.',
      ].join('\n')
      const response = await apiFetch(`/api/web-connections/${git.connectionId}/git/proposals`, {
        method: 'POST',
        body: JSON.stringify({ instructions, title: 'SEO: título y meta description de la portada', source: 'seo' }),
      })
      await readJson(response, 'No se pudo crear el pull request.')
      setGit(prev => ({ ...prev, saving: false, done: 'Propuesta encolada: el agente abrirá un pull request en unos minutos. Síguelo en Conexiones → Web.' }))
    } catch (applyError) {
      setGit(prev => ({ ...prev, saving: false, error: applyError.message }))
    }
  }

  async function applyToLanding() {
    if (!landingApply.campaignId || !snippets) return
    setLandingApply(prev => ({ ...prev, saving: true, error: '', done: '' }))
    try {
      const response = await apiFetch('/api/seo/apply-landing', {
        method: 'POST',
        body: JSON.stringify({ campaignId: landingApply.campaignId, title: snippets.title, metaDescription: snippets.metaDescription }),
      })
      const body = await readJson(response, 'No se pudo aplicar el SEO a la landing.')
      setLandingApply(prev => ({ ...prev, saving: false, done: `Aplicado a /l/${body.data.landingSlug}` }))
    } catch (applyError) {
      setLandingApply(prev => ({ ...prev, saving: false, error: applyError.message }))
    }
  }

  /** Prepara el borrador de Ads con las keywords transaccionales. Devuelve true si se puede navegar. */
  async function keywordsToAds() {
    if (!report?.keywords?.length) return false
    setAdsState({ saving: true, error: '' })
    try {
      const selected = report.keywords.filter(k => k.intent === 'transaccional' || k.intent === 'comercial').slice(0, 6).map(k => k.keyword)
      const response = await apiFetch('/api/ads/draft', {
        method: 'PUT',
        body: JSON.stringify({
          vertical: form.sector.trim() || hostnameOf(report.url),
          objetivo: `Captar demanda de búsqueda: ${selected.join(', ')}`,
          audience: form.city.trim() ? `Personas que buscan estos servicios en ${form.city.trim()}` : '',
        }),
      })
      await readJson(response, 'No se pudo preparar el borrador de la campaña.')
      setAdsState({ saving: false, error: '' })
      return true
    } catch (adsError) {
      setAdsState({ saving: false, error: adsError.message })
      return false
    }
  }

  async function shareReport() {
    if (!reportId) return
    setShare({ loading: true, url: '', error: '' })
    try {
      const response = await apiFetch(`/api/seo/reports/${reportId}/share`, { method: 'POST' })
      const body = await readJson(response, 'No se pudo crear el enlace del informe.')
      const url = `${window.location.origin}/seo-informe/${body.data.token}`
      await navigator.clipboard.writeText(url).catch(() => {})
      setShare({ loading: false, url, error: '' })
    } catch (shareError) {
      setShare({ loading: false, url: '', error: shareError.message })
    }
  }

  async function runKeywordGap() {
    const urls = competitorUrls.map(u => u.trim()).filter(Boolean)
    if (!urls.length) {
      setGap({ loading: false, items: null, error: 'Añade al menos una web de la competencia.' })
      return
    }
    setGap({ loading: true, items: null, error: '' })
    try {
      const response = await apiFetch('/api/seo/keyword-gap', { method: 'POST', body: JSON.stringify({ urls, keywords: (report?.keywords ?? []).map(k => k.keyword) }) })
      const body = await readJson(response, 'No se pudo analizar el keyword gap.')
      setGap({ loading: false, items: body.data.gaps ?? [], error: '' })
    } catch (gapError) {
      setGap({ loading: false, items: null, error: gapError.message })
    }
  }

  async function runCannibalization() {
    setCannibal({ loading: true, items: null, error: '' })
    try {
      const response = await apiFetch('/api/seo/cannibalization')
      const body = await readJson(response, 'No se pudo consultar la canibalización.')
      setCannibal({ loading: false, items: body.data ?? [], error: '' })
    } catch (cannibalError) {
      setCannibal({ loading: false, items: null, error: cannibalError.message })
    }
  }

  async function refreshStale(id) {
    setStaleState(prev => ({ ...prev, [id]: { loading: true, error: '' } }))
    try {
      const response = await apiFetch(`/api/seo/content/${id}/refresh`, { method: 'POST' })
      await readJson(response, 'No se pudo refrescar el artículo.')
      setStaleState(prev => ({ ...prev, [id]: { loading: false, done: true } }))
      setStale(prev => prev.filter(item => item.id !== id))
    } catch (refreshError) {
      setStaleState(prev => ({ ...prev, [id]: { loading: false, error: refreshError.message } }))
    }
  }

  const magnetUrl = useMemo(() => {
    const campaign = landingCampaigns.find(c => c.id === magnetCampaignId)
    return campaign ? `${window.location.origin}/audita/${campaign.landingSlug}` : ''
  }, [landingCampaigns, magnetCampaignId])

  // ── Derivados de presentación ───────────────────────────────────────────

  const checklist = report?.checklist ?? []
  const passed = checklist.filter(c => c.ok).length
  const failed = checklist.length - passed
  const site = report?.site ?? null
  const vitals = report?.webVitals ?? null
  const crawlIssues = site ? site.missingTitle + site.missingMeta + site.missingH1 + site.duplicateTitles.length + (site.imgsWithoutAlt > 0 ? 1 : 0) : 0

  const matchedRows = useMemo(() => (searchConsole?.matched ?? []).filter(m => m.rows.length), [searchConsole])
  const positioned = matchedRows.length
  const avgPosition = useMemo(() => {
    const values = matchedRows.flatMap(m => m.rows.map(r => r.position)).filter(p => p != null)
    return values.length ? values.reduce((sum, p) => sum + p, 0) / values.length : null
  }, [matchedRows])

  const scoreDelta = useMemo(() => (history.length < 2 ? null : history[history.length - 1].score - history[history.length - 2].score), [history])
  const publishedCount = Object.values(contentState).filter(s => s.publishedSlug).length
  const writtenCount = Object.values(contentState).filter(s => s.articleId).length
  const blogSlug = landingCampaigns[0]?.landingSlug ?? ''
  const reportAgeDays = report ? daysSince(report.generatedAt) : null

  const band = !report
    ? { state: reportLoading ? 'loading' : 'unknown', label: reportLoading ? 'Buscando tu último informe SEO…' : 'Ninguna web auditada', message: reportLoading ? 'Leyendo el informe guardado en tu cuenta.' : 'Lanza el primer análisis para tener diagnóstico, keywords y plan de contenidos.' }
    : !report.webAlive
      ? { state: 'partial', label: `${hostnameOf(report.url)} · no se pudo leer`, message: 'La web estaba caída o protegida contra bots: el plan se basa solo en los datos del formulario, no en la web real.' }
      : report.provider !== 'deepseek'
        ? { state: 'partial', label: `${hostnameOf(report.url)} · plan determinista`, message: 'Plan generado sin IA (DeepSeek no disponible): keywords y contenidos son la plantilla por sector.' }
        : reportAgeDays != null && reportAgeDays > 7
          ? { state: 'stale', label: `${hostnameOf(report.url)} · informe de hace ${reportAgeDays} días`, message: 'La vigilancia diaria sigue midiendo la salud técnica, pero el plan puede haberse quedado corto.' }
          : { state: 'ready', label: `${hostnameOf(report.url)} · auditada recientemente`, message: 'Auditoría sobre la web real, plan redactado con IA y vigilancia diaria activa.' }

  return {
    form, setField, setForm, competitorUrls, setCompetitorUrls, loading, error, setError,
    report, reportId, reportUrl, reportLoading, openingReportId, projects, openReport, switchProject, analyze,
    history, alerts, searchConsole, ranks,
    competitors, competitorsLoading, competitorsError, runCompare,
    contentState, patchContent, writeArticle, publishArticle, shareArticle,
    snippets, landingApply, setLandingApply, applyToLanding,
    wordpress, setWordpress, applyToWordPress,
    git, setGit, applyToGit,
    adsState, keywordsToAds, share, shareReport,
    magnetCampaignId, setMagnetCampaignId, magnetUrl,
    gap, runKeywordGap, cannibal, runCannibalization, stale, staleState, refreshStale,
    checklist, passed, failed, site, vitals, crawlIssues, matchedRows, positioned, avgPosition, scoreDelta,
    publishedCount, writtenCount, blogSlug, reportAgeDays, band, hostnameOf,
  }
}

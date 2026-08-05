import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  RiArrowDownSLine,
  RiArrowRightLine,
  RiCheckLine,
  RiCloseLine,
  RiCustomerService2Line,
  RiFlashlightLine,
  RiGlobalLine,
  RiInformationLine,
  RiLockLine,
  RiMapPinTimeLine,
  RiMessage2Line,
  RiPhoneLine,
  RiQuestionLine,
  RiRocketLine,
  RiSparkling2Line,
  RiTimeLine,
  RiUserAddLine,
} from 'react-icons/ri'
import './landing.css'
import { useI18n } from '../i18n'
import { createLandingTelemetry, observeScrollDepth } from '../lib/landingTelemetry'

const PREVIEW_LANDING = {
  campaignId: 'preview-campaign',
  name: 'Más clientes, sin perseguirlos',
  offer: 'Primera conversación de orientación sin coste',
  leadMagnet: 'Te llevamos una propuesta clara para tu siguiente paso.',
  adCopy: 'Cuéntanos qué quieres conseguir y descubre una forma más sencilla de convertir el interés en conversaciones reales.',
  landingTemplateId: 'generic-v1',
  imageUrl: '',
}

const TEMPLATE_COPY = {
  'gym-trial-v1': {
    title: 'Vuelve a disfrutar de entrenar con un plan hecho para ti.',
    description: 'Da el primer paso con una experiencia cercana, flexible y pensada para que mantengas el ritmo.',
    benefits: ['Plan adaptado a tu objetivo', 'Acompañamiento desde el primer día', 'Un espacio donde te apetece volver'],
    location: 'Experiencia local y cercana',
  },
  'pet-grooming-v1': {
    title: 'Tu mascota se merece sentirse así de bien.',
    description: 'Reserva una primera visita cuidada al detalle y deja que tu compañero salga limpio, tranquilo y feliz.',
    benefits: ['Cuidado adaptado a cada mascota', 'Profesionales que tratan con cariño', 'Reserva sencilla y sin esperas'],
    location: 'Cuidado pensado para tu mascota',
  },
  'legal-consult-v1': {
    title: 'Entiende tus opciones antes de tomar una decisión.',
    description: 'Habla con un profesional, ordena tu caso y recibe una orientación clara para avanzar con confianza.',
    benefits: ['Primera orientación clara', 'Profesionales especializados', 'Siguiente paso definido contigo'],
    location: 'Atención profesional y confidencial',
  },
  'generic-v1': {
    title: 'Convierte tu próximo interés en una conversación real.',
    description: 'Cuéntanos qué necesitas y recibe una orientación personalizada, sin rodeos y con un siguiente paso claro.',
    benefits: ['Respuesta personalizada', 'Acompañamiento de principio a fin', 'Una propuesta adaptada a tu negocio'],
    location: 'Atención humana y cercana',
  },
}

const TEMPLATE_COPY_EN = {
  'gym-trial-v1': {
    title: 'Enjoy training again with a plan made for you.',
    description: 'Take the first step with a friendly, flexible experience designed to help you keep your rhythm.',
    benefits: ['A plan adapted to your goal', 'Support from day one', 'A space you will want to come back to'],
    location: 'A local and welcoming experience',
  },
  'pet-grooming-v1': {
    title: 'Your pet deserves to feel this good.',
    description: 'Book a carefully planned first visit and let your companion leave clean, calm and happy.',
    benefits: ['Care adapted to every pet', 'Professionals who treat them with care', 'Easy booking with no waiting'],
    location: 'Care designed for your pet',
  },
  'legal-consult-v1': {
    title: 'Understand your options before making a decision.',
    description: 'Talk to a professional, organize your case and receive clear guidance to move forward with confidence.',
    benefits: ['Clear first guidance', 'Specialized professionals', 'A next step defined with you'],
    location: 'Professional and confidential support',
  },
  'generic-v1': {
    title: 'Turn your next expression of interest into a real conversation.',
    description: 'Tell us what you need and receive personalized guidance, without detours and with a clear next step.',
    benefits: ['Personalized response', 'Support from start to finish', 'A proposal adapted to your business'],
    location: 'Human and welcoming support',
  },
}

const FAQS = [
  {
    question: '¿Qué ocurre después de enviar mis datos?',
    answer: 'Revisamos tu solicitud y nos ponemos en contacto contigo para entender mejor lo que necesitas y recomendarte el siguiente paso.',
  },
  {
    question: '¿Tengo que contratar nada en la primera conversación?',
    answer: 'No. La primera conversación sirve para conocernos, resolver tus dudas y comprobar si podemos ayudarte de verdad.',
  },
  {
    question: '¿Puedo elegir cuándo me contactáis?',
    answer: 'Sí. Puedes indicarnos tu franja preferida y haremos lo posible por respetarla.',
  },
  {
    question: '¿Cómo utilizáis mis datos?',
    answer: 'Solo los utilizamos para responder a esta solicitud y coordinar el contacto que nos has pedido.',
  },
]

const FAQS_EN = [
  { question: 'What happens after I submit my details?', answer: 'We review your request and contact you to better understand what you need and recommend the next step.' },
  { question: 'Do I have to buy anything in the first conversation?', answer: 'No. The first conversation is a chance to get to know each other, answer your questions and see whether we can genuinely help.' },
  { question: 'Can I choose when you contact me?', answer: 'Yes. You can share your preferred time window and we will do our best to respect it.' },
  { question: 'How do you use my data?', answer: 'We only use it to respond to this request and coordinate the contact you asked for.' },
]

function isPreviewSlug(slug, searchParams) {
  return searchParams.get('preview') === '1' || slug === 'preview'
}

function getCopy(landing, slug, locale = 'es') {
  const templateId = landing?.landingTemplateId || (slug?.includes('gym') ? 'gym-trial-v1' : slug?.includes('pet') ? 'pet-grooming-v1' : slug?.includes('legal') ? 'legal-consult-v1' : 'generic-v1')
  const templateSet = locale === 'en' ? TEMPLATE_COPY_EN : TEMPLATE_COPY
  const template = templateSet[templateId] || templateSet['generic-v1']
  const previewData = landing?.campaignId === 'preview-campaign'
  const baseName = previewData && locale === 'en' ? 'More customers, without chasing them' : landing?.name || (locale === 'en' ? 'More customers, without chasing them' : PREVIEW_LANDING.name)

  return {
    ...template,
    templateId,
    // El titular propio manda sobre el de la plantilla. Sin esto, el H1 sería
    // siempre texto genérico —justo lo que el diagnóstico de desalineación de
    // mensaje señala— y el parche de hero de una variante no cambiaría nada.
    title: landing?.title || template.title,
    name: baseName,
    offer: previewData && locale === 'en' ? 'A first guidance conversation at no cost' : landing?.offer || (locale === 'en' ? 'A first guidance conversation at no cost' : PREVIEW_LANDING.offer),
    leadMagnet: previewData && locale === 'en' ? 'We will bring you a clear proposal for your next step.' : landing?.leadMagnet || (locale === 'en' ? 'We will bring you a clear proposal for your next step.' : PREVIEW_LANDING.leadMagnet),
    adCopy: previewData && locale === 'en' ? 'Tell us what you want to achieve and discover a simpler way to turn interest into real conversations.' : landing?.adCopy || template.description,
    imageUrl: landing?.imageUrl || '/assets/landings/landing-hero.png',
  }
}

function scrollToForm() {
  document.querySelector('#landing-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function landingSessionId(slug) {
  const key = `vendrava_landing_session_${slug}`
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    window.sessionStorage.setItem(key, value)
    return value
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  }
}

function buildLandingTracking(slug, searchKey) {
  const params = new URLSearchParams(searchKey)
  return {
    sessionId: landingSessionId(slug),
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_term: params.get('utm_term') || undefined,
    gclid: params.get('gclid') || undefined,
    fbclid: params.get('fbclid') || undefined,
    referrer: document.referrer || undefined,
    path: `${window.location.pathname}${window.location.search}`,
  }
}

// La telemetría llega como ref, no como valor: el efecto que la crea corre
// después del primer render y un valor suelto se quedaría congelado en `null`.
function LandingForm({ slug, preview, tracking, telemetryRef, hiddenFields = [], onSubmitted }) {
  const { t } = useI18n()
  // Campos que la variante activa del experimento retira del formulario (§9).
  // Nombre, teléfono y consentimiento nunca llegan aquí: el servidor los filtra
  // porque sin ellos no se puede atender la solicitud ni acreditar permiso.
  const isHidden = field => hiddenFields.includes(field)
  const [form, setForm] = useState({ name: '', phone: '', email: '', contactTime: 'Cuando antes', consent: false, website: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  // Exposición real por campo (§7.2): sin el instante de foco no hay tiempo
  // medio, y sin `started` el form_start se repetiría en cada tecla.
  const focusedAt = useRef({})
  const started = useRef(false)

  function track(type, payload) {
    telemetryRef?.current?.track(type, payload)
  }

  function fieldHandlers(field) {
    return {
      onFocus: () => {
        focusedAt.current[field] = Date.now()
        if (!started.current) {
          started.current = true
          track('form_start')
        }
      },
      onBlur: event => {
        const startedAt = focusedAt.current[field]
        const value = event?.target?.type === 'checkbox' ? event.target.checked : event?.target?.value
        // Se registra si el campo quedó relleno. Nunca con qué.
        track('form_field_blur', {
          field,
          filled: typeof value === 'boolean' ? value : Boolean(String(value ?? '').trim()),
          value: startedAt ? Date.now() - startedAt : undefined,
        })
      },
    }
  }

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    if (formError) setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) {
      setFormError(t('landing.namePhoneRequired'))
      track('form_validation_error', { field: form.name.trim() ? 'phone' : 'name' })
      return
    }
    if (!form.consent) {
      setFormError(t('landing.consentRequired'))
      track('form_validation_error', { field: 'consent' })
      return
    }

    setSubmitting(true)
    setFormError('')
    try {
      if (!preview) {
        const response = await fetch(`/api/public/landing/${slug}/lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            contactTime: form.contactTime,
            consent: form.consent,
            consentVersion: 'contact-request-v1',
            website: form.website,
            ...tracking,
          }),
        })
        if (!response.ok) throw new Error('No se pudo enviar la solicitud.')
      } else {
        await new Promise(resolve => setTimeout(resolve, 550))
      }
      track('form_submit')
      // El envío es el final del recorrido medible en la página: se vacía la
      // cola ya, no cuando el visitante cierre la pestaña.
      telemetryRef?.current?.flush()
      onSubmitted(form)
    } catch (error) {
      track('form_error')
      setFormError(error.message || t('landing.sendError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="landing-form-shell" id="landing-form">
      <div className="landing-form-heading">
        <div className="landing-form-step"><span>01</span><i /><span>02</span></div>
        <div>
          <span className="landing-form-kicker">{t('landing.formStep')}</span>
          <h2>{t('landing.formTitle')}</h2>
          <p>{t('landing.formDescription')}</p>
        </div>
      </div>

      <form className="landing-form" onSubmit={handleSubmit} noValidate>
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
          <label>
            <span>Website</span>
            <input name="website" value={form.website} onChange={event => updateField('website', event.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <label>
          <span>{t('landing.fullName')} <b>*</b></span>
          <input value={form.name} onChange={event => updateField('name', event.target.value)} placeholder="Tu nombre" autoComplete="name" {...fieldHandlers('name')} />
        </label>
        <label>
          <span>{t('landing.phone')} <b>*</b></span>
          <input value={form.phone} onChange={event => updateField('phone', event.target.value)} placeholder="+34 600 000 000" type="tel" autoComplete="tel" {...fieldHandlers('phone')} />
        </label>
        {isHidden('email') ? null : <label>
          <span>Email <em>{t('landing.optional')}</em></span>
          <input value={form.email} onChange={event => updateField('email', event.target.value)} placeholder="tu@email.com" type="email" autoComplete="email" {...fieldHandlers('email')} />
        </label>}
        {isHidden('contactTime') ? null : <label>
          <span>{t('landing.bestTime')}</span>
          <select value={form.contactTime} onChange={event => updateField('contactTime', event.target.value)} {...fieldHandlers('contactTime')}>
            <option>{t('landing.asSoonAsPossible')}</option>
            <option>{t('landing.morning')}</option>
            <option>{t('landing.afternoon')}</option>
            <option>{t('landing.afterSix')}</option>
          </select>
        </label>}

        <label className="landing-consent">
          <input type="checkbox" checked={form.consent} onChange={event => updateField('consent', event.target.checked)} {...fieldHandlers('consent')} />
          <span>{t('landing.consent')}</span>
        </label>

        {formError && <p className="landing-form-error" role="alert"><RiInformationLine /> {formError}</p>}

        <button className="landing-primary-button landing-submit" type="submit" disabled={submitting}>
          {submitting ? t('landing.sendingRequest') : <>{t('landing.contactMe')} <RiArrowRightLine /></>}
        </button>
        <p className="landing-form-privacy"><RiLockLine /> {t('landing.usedOnly')}</p>
      </form>
    </div>
  )
}

function SuccessCard({ name, onReset }) {
  const { t } = useI18n()
  return (
    <div className="landing-success-card" role="status" aria-live="polite">
      <div className="landing-success-icon"><RiCheckLine /></div>
      <span className="landing-form-kicker">{t('landing.requestReceived')}</span>
      <h2>{t('landing.thanks', { name: name.trim().split(' ')[0] })}</h2>
      <p>{t('landing.receivedDescription')}</p>
      <div className="landing-success-steps">
        <span><RiCheckLine /> {t('landing.reviewRequest')}</span>
        <span><RiTimeLine /> {t('landing.respectTime')}</span>
        <span><RiMessage2Line /> {t('landing.clearResponse')}</span>
      </div>
      <button className="landing-text-button" type="button" onClick={onReset}><RiCloseLine /> {t('landing.closeConfirmation')}</button>
    </div>
  )
}

function AppIcon({ type }) {
  const icons = {
    response: RiMessage2Line,
    support: RiCustomerService2Line,
    result: RiRocketLine,
  }
  const Icon = icons[type] || RiSparkling2Line
  return <Icon aria-hidden="true" />
}

export default function PublicLandingPage() {
  const { slug } = useParams()
  const { t, locale } = useI18n()
  const [searchParams] = useSearchParams()
  const searchKey = searchParams.toString()
  const preview = isPreviewSlug(slug, searchParams)
  const [landing, setLanding] = useState(null)
  const [loading, setLoading] = useState(!preview)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(null)
  const [openFaq, setOpenFaq] = useState(0)
  const telemetry = useRef(null)

  useEffect(() => {
    if (preview) {
      setLanding(PREVIEW_LANDING)
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')
    // La sesión viaja al pedir la landing para que el servidor pueda asignar
    // variante de experimento (landings.md §9). El navegador nunca elige.
    fetch(`/api/public/landing/${slug}?sessionId=${encodeURIComponent(landingSessionId(slug))}`, { signal: controller.signal })
      .then(response => {
        if (response.status === 404) throw new Error('Landing no encontrada')
        if (!response.ok) throw new Error('No se pudo cargar la landing')
        return response.json()
      })
      .then(setLanding)
      .catch(requestError => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      // En StrictMode el primer efecto se aborta: no apagues el spinner o la segunda
      // petición, aún en vuelo, mostraría el error de "landing no encontrada".
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })

    return () => controller.abort()
  }, [preview, slug])

  // SEO on-page aplicado desde la página /seo: title y meta description
  // guardados en adAssets.seo de la campaña.
  useEffect(() => {
    if (!landing?.seo?.title) return undefined
    const previousTitle = document.title
    document.title = landing.seo.title
    let meta = document.querySelector('meta[name="description"]')
    const previousDescription = meta?.getAttribute('content') ?? null
    if (landing.seo.metaDescription) {
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', 'description')
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', landing.seo.metaDescription)
    }
    return () => {
      document.title = previousTitle
      if (meta && previousDescription != null) meta.setAttribute('content', previousDescription)
    }
  }, [landing])

  const tracking = useMemo(() => preview ? null : buildLandingTracking(slug, searchKey), [preview, searchKey, slug])

  useEffect(() => {
    if (preview || !landing?.campaignId || !tracking) return
    const controller = new AbortController()
    fetch(`/api/public/landing/${slug}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tracking),
      signal: controller.signal,
    }).then(response => {
      if (!response.ok) console.warn(`[LandingTracking] No se pudo registrar la visita (${response.status})`)
    }).catch(error => {
      if (error.name !== 'AbortError') console.warn('[LandingTracking] No se pudo registrar la visita', error)
    })
    return () => controller.abort()
  }, [landing?.campaignId, preview, slug, tracking])

  // Telemetría de comportamiento (§7.1). El evento `view` no se emite aquí: lo
  // registra el servidor en /view, para que la visita tenga un único origen.
  useEffect(() => {
    if (preview || !landing?.campaignId || !tracking) return undefined
    const instance = createLandingTelemetry({ slug, tracking })
    telemetry.current = instance
    const stopScrollDepth = observeScrollDepth(mark => instance.track(`scroll_${mark}`, { value: mark }))
    return () => {
      stopScrollDepth()
      instance.dispose()
      telemetry.current = null
    }
  }, [landing?.campaignId, preview, slug, tracking])

  const goToForm = useCallback(origin => {
    telemetry.current?.track('cta_click', { field: origin })
    scrollToForm()
  }, [])

  const copy = useMemo(() => getCopy(landing, slug, locale), [landing, locale, slug])
  const faqs = locale === 'en' ? FAQS_EN : FAQS

  if (loading) {
    return (
      <main className="landing-loading">
        <div className="landing-loading-mark"><RiSparkling2Line /></div>
        <span>{t('landing.loading')}</span>
      </main>
    )
  }

  if (error || !landing) {
    return (
      <main className="landing-error-page">
        <div className="landing-error-card">
          <div className="landing-error-icon"><RiQuestionLine /></div>
          <h1>{t('landing.openError')}</h1>
          <p>{error || t('landing.retryLink')}</p>
          <button className="landing-primary-button" type="button" onClick={() => window.location.reload()}>{t('landing.retry')} <RiArrowRightLine /></button>
        </div>
      </main>
    )
  }

  return (
    <div className={`landing-page landing-template-${copy.templateId}`}>
      <div className="landing-noise" aria-hidden="true" />
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label={t('landing.backHome')}>
          <img src="/logo.png" alt="Vendrava" />
          <span>Vendrava</span>
        </a>
        <nav className="landing-nav-links" aria-label={t('landing.landingNav')}>
          <a href="#beneficios">{t('landing.includes')}</a>
          <a href="#proceso">{t('landing.process')}</a>
          <a href="#faq">{t('landing.faq')}</a>
        </nav>
        <button className="landing-nav-cta" type="button" onClick={() => goToForm('nav')}>{t('landing.information')} <RiArrowRightLine /></button>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <h1>{copy.title}</h1>
            <p className="landing-hero-description">{copy.adCopy || copy.description}</p>
            <div className="landing-hero-actions">
              <button className="landing-primary-button" type="button" onClick={() => goToForm('hero')}>{t('landing.nextStep')} <RiArrowRightLine /></button>
              <a className="landing-secondary-button" href="#proceso"><RiFlashlightLine /> {t('landing.seeProcess')}</a>
            </div>
            <div className="landing-hero-trust">
              <span><RiCheckLine /> {t('landing.noCommitment')}</span>
              <span><RiLockLine /> {t('landing.protectedData')}</span>
              <span><RiTimeLine /> {t('landing.humanResponse')}</span>
            </div>
          </div>

          <div className="landing-hero-stage">
            <img className="landing-hero-image" src={copy.imageUrl} alt={t('landing.personalizedExperience')} />
            <div className="landing-hero-image-shade" aria-hidden="true" />
            <div className="landing-signal-card"><RiPhoneLine /><span>{t('landing.nextMove')}</span><strong>{t('landing.startsHere')}</strong></div>
            <div className="landing-offer-card"><span>{t('landing.offerAvailable')}</span><strong>{copy.offer}</strong><small><RiCheckLine /> {t('landing.noFinePrint')}</small></div>
            <div className="landing-form-slot" id="landing-form">
              {submitted ? <SuccessCard name={submitted.name} onReset={() => setSubmitted(null)} /> : <LandingForm slug={slug} preview={preview} tracking={tracking} telemetryRef={telemetry} hiddenFields={landing?.hiddenFields ?? []} onSubmitted={setSubmitted} />}
            </div>
          </div>
        </section>

        <section className="landing-offer-band" aria-label={t('landing.receive')}>
          <div className="landing-offer-band-icon"><RiSparkling2Line /></div>
          <div><span>{t('landing.nextMove')}</span><strong>{copy.leadMagnet}</strong></div>
          <button className="landing-text-button" type="button" onClick={() => goToForm('offer_band')}>{t('landing.requestGuidance')} <RiArrowRightLine /></button>
        </section>

        <section className="landing-section landing-benefits" id="beneficios">
          <div className="landing-section-heading"><span className="landing-section-kicker">{t('landing.includes')}</span><h2>{t('landing.benefitsTitle')}</h2><p>{t('landing.benefitsDescription')}</p></div>
          <div className="landing-benefit-grid">
            {[ 
              { icon: 'response', title: copy.benefits[0], text: locale === 'en' ? 'We start from your real situation to give you an answer that makes sense.' : 'Partimos de tu situación real para darte una respuesta que tenga sentido.' },
              { icon: 'support', title: copy.benefits[1], text: locale === 'en' ? 'We support you throughout the process and answer your questions directly.' : 'Te acompañamos durante el proceso y resolvemos tus dudas sin rodeos.' },
              { icon: 'result', title: copy.benefits[2], text: locale === 'en' ? 'You finish with a clear recommendation and a concrete action to get started.' : 'Terminas con una recomendación clara y una acción concreta para empezar.' },
            ].map(item => (
              <article className="landing-benefit" key={item.title}>
                <div className="landing-benefit-icon"><AppIcon type={item.icon} /></div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <span><RiCheckLine /> {t('landing.designedForCase')}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-process-panel landing-section" id="proceso">
          <div className="landing-section-heading centered"><span className="landing-section-kicker">{t('landing.process')}</span><h2>{t('landing.processTitle')}</h2><p>{t('landing.processDescription')}</p></div>
          <div className="landing-process-grid">
            {[
              { number: '01', icon: RiMessage2Line, title: t('landing.tellUs'), text: t('landing.tellUsText') },
              { number: '02', icon: RiUserAddLine, title: t('landing.guideYou'), text: t('landing.guideYouText') },
              { number: '03', icon: RiRocketLine, title: t('landing.start'), text: t('landing.startText') },
            ].map((item, index) => {
              const Icon = item.icon
              return <article className="landing-process-step" key={item.number}><div className="landing-process-number">{item.number}</div><div className="landing-process-icon"><Icon /></div><h3>{item.title}</h3><p>{item.text}</p>{index < 2 && <span className="landing-process-connector" aria-hidden="true"><RiArrowRightLine /></span>}</article>
            })}
          </div>
        </section>

        <section className="landing-next-step landing-section">
          <div className="landing-next-step-icon"><RiMapPinTimeLine /></div>
          <div><span>{copy.location}</span><h2>{t('landing.conversationBeforeCall')}</h2><p>{t('landing.contextText')}</p></div>
          <button className="landing-secondary-button" type="button" onClick={() => goToForm('next_step')}>{t('landing.talkToSomeone')} <RiArrowRightLine /></button>
        </section>

        <section className="landing-section landing-faq" id="faq">
          <div className="landing-section-heading centered"><span className="landing-section-kicker">{t('landing.faq')}</span><h2>{t('landing.resolveQuestions')}</h2><p>{t('landing.faqDescription')}</p></div>
          <div className="landing-faq-list">
            {faqs.map((item, index) => {
              const isOpen = openFaq === index
              return <div className={`landing-faq-item${isOpen ? ' is-open' : ''}`} key={item.question}><button type="button" aria-expanded={isOpen} onClick={() => setOpenFaq(isOpen ? -1 : index)}><span>{item.question}</span><RiArrowDownSLine /></button>{isOpen && <p>{item.answer}</p>}</div>
            })}
          </div>
        </section>

        <section className="landing-final-cta">
          <div><span>{t('landing.ready')}</span><h2>{t('landing.finalTitle')}</h2><p>{t('landing.finalText')}</p></div>
          <button className="landing-primary-button" type="button" onClick={() => goToForm('final')}>{t('landing.nextStep')} <RiArrowRightLine /></button>
        </section>
      </main>

      <footer className="landing-footer"><span><RiGlobalLine /> {t('landing.landingFooter')}</span><span><RiLockLine /> {t('landing.responsibleData')}</span></footer>
      <button className="landing-mobile-cta" type="button" onClick={() => goToForm('mobile')}>{t('landing.contactMe')} <RiArrowRightLine /></button>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { RiArrowLeftLine, RiArrowRightLine, RiCheckLine, RiCloseLine, RiRadarLine, RiGroupLine, RiBuildingLine, RiBox3Line, RiMegaphoneLine, RiShakeHandsLine, RiMapPinLine, RiFocus3Line, RiFileTextLine } from 'react-icons/ri'
import { radarObjectives, radarSummary, radarType, withRadarObjectives, radarHasBusinessInfo } from '../lib/opportunityRadar'
import RadarCompanyKnowledge from './RadarCompanyKnowledge'
import { useAssistantScreen } from '../lib/useAssistantScreen'

const STEPS = [['Tu negocio', 'El punto de partida'], ['Tus objetivos', 'Qué quieres encontrar'], ['Criterios', 'Afina cada búsqueda'], ['Activación', 'Revisa y activa']]
const ICONS = { clients: RiGroupLine, properties: RiBuildingLine, suppliers: RiBox3Line, influencers: RiMegaphoneLine, partners: RiShakeHandsLine }
const SIGNALS = { clients: ['Negocio en expansión', 'Nueva apertura', 'Reservas online'], properties: ['Venta de particular', 'Anuncio reciente', 'Necesita reforma'], suppliers: ['Catálogo público', 'Cobertura local', 'Servicio especializado'], influencers: ['Contenido reciente', 'Audiencia local', 'Colaboraciones de marca'], partners: ['Servicios complementarios', 'Red de distribución', 'Presencia local'] }
const CHANNELS = [['web', 'Web pública'], ['linkedin', 'LinkedIn'], ['instagram', 'Instagram'], ['youtube', 'YouTube']]

export default function RadarSetupFlow({ context, draft, setDraft, busy, starting, activeJob, consent, setConsent, available, onSubmit, showSchedule, setShowSchedule, intervalHours, setIntervalHours, startsAt, setStartsAt, error }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [knowledgeWorking, setKnowledgeWorking] = useState(false)
  const dialog = useRef(null)
  const content = useRef(null)
  const setup = context.radarSetup
  const business = setup?.businesses?.find(item => item.id === draft.businessType)
  const objectives = radarObjectives(draft)
  const ready = consent && available && radarHasBusinessInfo(context, draft) && business && objectives.length
  useAssistantScreen('radar', { ready: !!setup?.businesses?.length, form: open ? 'radar_setup' : null, filters: { name: draft.name || '', location: draft.location || '' } }, async command => {
    if (command.name === 'refresh') return
    if (command.name !== 'open_radar') throw new Error('Esta operación no está conectada al radar.')
    if (busy || starting || knowledgeWorking) throw new Error('El radar está trabajando. Espera a que termine antes de cambiar su configuración.')
    if (open) throw new Error('La configuración ya está abierta. Guarda o cierra los cambios antes de preparar otra.')
    setDraft(current => ({ ...current, ...command.args })); setStep(0); setOpen(true)
    return { message: 'Configuración del radar abierta. Los datos están preparados en el borrador; no se ha lanzado ninguna búsqueda.', verify: state => state.ready && state.form === 'radar_setup' }
  })
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])
  function goTo(next) { setStep(next); requestAnimationFrame(() => { content.current?.scrollTo({ top: 0 }); content.current?.querySelector('h3')?.focus({ preventScroll: true }) }) }
  function chooseBusiness(id) {
    if (id === draft.businessType) return
    const first = setup.businesses.find(item => item.id === id).goals[0]
    setDraft(current => withRadarObjectives({ ...current, businessType: id }, [{ kind: first.kind, target: first.target, criteria: '', channels: ['web'] }]))
  }
  function toggleGoal(goal) {
    setDraft(current => { const previous = radarObjectives(current); return withRadarObjectives(current, previous.some(item => item.kind === goal.kind) ? previous.filter(item => item.kind !== goal.kind) : [...previous, { kind: goal.kind, target: goal.target, criteria: '', channels: ['web'] }]) })
  }
  function updateObjective(kind, update) { setDraft(current => withRadarObjectives(current, radarObjectives(current).map(item => item.kind === kind ? { ...item, ...update } : item))) }
  async function submit(event) {
    if (step < 3) { event.preventDefault(); if (business && (step === 0 || objectives.length)) goTo(step + 1); return }
    if (await onSubmit(event)) setOpen(false)
  }
  const field = (label, key, placeholder, max = 500) => <label>{label}<input value={draft[key] ?? ''} maxLength={max} placeholder={placeholder} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /></label>
  if (!setup?.businesses?.length) return <p className="radar-notice">No se pudo cargar la configuración por negocio. Actualiza la información para volver a intentarlo.</p>
  return <>
    <div className="radar-launch"><div className="radar-orbit" aria-hidden="true"><RiRadarLine /><i /><i /></div><div className="radar-launch-copy"><h2>Tu radar, a tu medida</h2><p>Combina clientes, proveedores y colaboradores. Tú eliges el foco; el radar reúne las oportunidades.</p><div className="radar-launch-meta"><span><RiBuildingLine />{business?.label || 'Define tu negocio'}</span><span><RiMapPinLine />{draft.location || 'Elige un mercado'}</span></div></div><button type="button" className="radar-primary" disabled={busy} onClick={() => setOpen(true)}>Configurar mi radar<RiArrowRightLine /></button></div>
    <dialog ref={dialog} className="opportunity-radar radar-dialog" aria-labelledby="radar-modal-title" onCancel={event => { if (starting || knowledgeWorking) event.preventDefault(); else setOpen(false) }} onClose={() => setOpen(false)}>
      <header className="radar-modal-header"><div><h2 id="radar-modal-title">Configura tu radar</h2><p>Conecta tu negocio con nuevas oportunidades</p></div><button type="button" aria-label="Cerrar configuración" disabled={starting || knowledgeWorking} onClick={() => setOpen(false)}><RiCloseLine /></button></header>
      <form onSubmit={submit} className="radar-modal-form"><fieldset disabled={busy || knowledgeWorking} className="radar-modal-grid">
        <aside className="radar-modal-rail"><nav aria-label="Pasos de configuración"><ol>{STEPS.map(([label, detail], index) => <li key={label}><button type="button" disabled={index > step} aria-current={step === index ? 'step' : undefined} onClick={() => goTo(index)}><span className="radar-step-number">{index < step ? <RiCheckLine /> : index + 1}</span><span><b>{label}</b><small>{detail}</small></span></button></li>)}</ol></nav><div className="radar-rail-summary"><RiRadarLine /><b>{draft.name || 'Tu radar'}</b><p>{business?.label}</p><p>{draft.location || 'Mercado por definir'}</p><span>{objectives.length} objetivos seleccionados</span></div></aside>
        <section className="radar-modal-body dark-scroll" ref={content}><div key={step} className="radar-step-enter"><h3 tabIndex={-1}>{['¿A qué se dedica tu empresa?', '¿Qué oportunidades quieres encontrar?', 'Una búsqueda precisa para cada objetivo', 'Todo listo para activar tu radar'][step]}</h3>
        {step === 0 ? <>
          <p className="radar-step-description">{setup.reason}</p>
          <div className="radar-fields radar-flow-fields">{field('Nombre del radar', 'name', 'Ej. Expansión en Madrid', 100)}<label>Actividad<select aria-label="Actividad" value={draft.businessType || setup.suggestedType} onChange={event => chooseBusiness(event.target.value)}>{setup.businesses.map(item => <option key={item.id} value={item.id}>{item.label}{item.id === setup.suggestedType ? ' · Sugerido' : ''}</option>)}</select></label></div>
          <div className="radar-business-note"><RiBuildingLine /><div><strong>{business?.label}</strong><p>{business?.description}</p></div></div>
          <div className="radar-fields radar-flow-fields">{field('Qué vendes u ofreces', 'offering', context.profile.valueProposition || 'Tu producto o servicio principal')}{field('A quién te diriges', 'audience', context.profile.idealCustomer || 'Tu cliente o audiencia ideal')}<label className="radar-criteria-field">Mercado geográfico<input required minLength={2} maxLength={200} value={draft.location} placeholder="Ciudad, región o país" onChange={event => setDraft(current => ({ ...current, location: event.target.value }))} /></label></div>
          <p className="radar-step-description">Esta información afina este radar. Puedes configurar otros con diferentes mercados y objetivos.</p>
          <RadarCompanyKnowledge context={context} draft={draft} setDraft={setDraft} onWorking={setKnowledgeWorking} />
        </> : null}
        {step === 1 && business ? <>
          <p className="radar-step-description">Selecciona varios objetivos. Afinaremos cada búsqueda por separado.</p>
          <div className="radar-goal-grid">{business.goals.map(goal => { const selected = objectives.some(item => item.kind === goal.kind); const Icon = ICONS[goal.kind]; return <button key={goal.kind} type="button" className="radar-goal-card" aria-pressed={selected} onClick={() => toggleGoal(goal)}><span className="radar-goal-top"><Icon /><span className="radar-check">{selected ? <RiCheckLine /> : null}</span></span><strong>{goal.kind === 'partners' ? 'Colaboradores' : radarType(goal.kind)?.label}</strong><span>{goal.description}</span><small>{goal.target || 'Define tu búsqueda en el siguiente paso'}</small></button> })}</div>
          <div className="radar-selection" role="status"><RiCheckLine /><div><strong>{objectives.length} objetivos seleccionados</strong><p>{objectives.length ? radarSummary(draft) : 'Elige al menos uno para continuar.'}</p></div></div>
        </> : null}
        {step === 2 ? <>
          <p className="radar-step-description">Ajusta el destinatario, las señales y las fuentes de cada objetivo. Las señales orientan la búsqueda y se contrastarán con las fuentes.</p>
          {objectives.map((objective, index) => { const goal = business?.goals.find(item => item.kind === objective.kind); const Icon = ICONS[objective.kind]; return <div className="radar-objective-editor" key={objective.kind} role="group" aria-label={`Criterios de ${radarType(objective.kind)?.label}`}><header><Icon /><h4>{radarType(objective.kind)?.label}</h4><span>{index + 1} / {objectives.length}</span></header>
            <label>Qué necesitas<input required minLength={3} maxLength={300} value={objective.target} placeholder={goal?.target || 'Describe a quién quieres encontrar'} onChange={event => updateObjective(objective.kind, { target: event.target.value })} /></label>
            <label>Criterios específicos<textarea rows={2} maxLength={600} value={objective.criteria} placeholder={goal?.criteriaPlaceholder} onChange={event => updateObjective(objective.kind, { criteria: event.target.value })} /></label>
            <div className="radar-chip-group" role="group" aria-label="Señales de interés"><span>Señales de interés</span><div>{SIGNALS[objective.kind].map(signal => <button type="button" key={signal} aria-pressed={objective.signals?.includes(signal) || false} onClick={() => updateObjective(objective.kind, { signals: objective.signals?.includes(signal) ? objective.signals.filter(item => item !== signal) : [...(objective.signals || []), signal] })}>{signal}</button>)}</div></div>
            <div className="radar-chip-group" role="group" aria-label="Fuentes preferidas"><span>Fuentes preferidas</span><div>{CHANNELS.map(([id, label]) => <button type="button" key={id} aria-pressed={(objective.channels || ['web']).includes(id)} onClick={() => { const channels = objective.channels || ['web']; updateObjective(objective.kind, { channels: channels.includes(id) ? channels.length > 1 ? channels.filter(item => item !== id) : channels : [...channels, id] }) }}>{label}</button>)}</div></div>
            <label>Qué quieres excluir<input maxLength={300} value={objective.exclusions || ''} placeholder="Ej. franquicias, directorios o perfiles inactivos" onChange={event => updateObjective(objective.kind, { exclusions: event.target.value })} /></label>
          </div> })}
        </> : null}
        {step === 3 ? <>
          <p className="radar-step-description">{draft.name || 'Tu radar'} · {business?.label} · {draft.location}</p>
          {draft.companyKnowledge ? <p className="radar-material-summary"><RiFileTextLine />{draft.companyKnowledge.services.length} servicios con sus condiciones · {draft.companyKnowledge.sourceIds.length} fuentes seleccionadas{draft.companyKnowledge.website ? ` · ${draft.companyKnowledge.website}` : ''}</p> : null}
          <div className="radar-review-objectives">{objectives.map(objective => <div key={objective.kind}><RiFocus3Line /><div><strong>{radarType(objective.kind)?.label}</strong><p>{objective.target}</p><small>{[objective.criteria, ...(objective.signals || []), objective.exclusions && `Excluir: ${objective.exclusions}`].filter(Boolean).join(' · ') || 'Sin criterios adicionales'}</small><small>Fuentes: {(objective.channels || ['web']).map(id => CHANNELS.find(item => item[0] === id)?.[1]).join(', ')}</small></div></div>)}</div>
          <div className="radar-activation" role="group" aria-label="Modo de ejecución"><button type="button" aria-pressed={!showSchedule} onClick={() => setShowSchedule(false)}>Lanzar ahora</button><button type="button" aria-pressed={showSchedule} onClick={() => setShowSchedule(true)}>Programar búsqueda</button></div>
          {showSchedule ? <div className="radar-schedule-fields"><label>Frecuencia<select aria-label="Frecuencia" value={intervalHours} onChange={event => setIntervalHours(Number(event.target.value))}><option value={24}>Cada 24 horas</option><option value={168}>Cada 7 días</option></select></label><label>Primera búsqueda<input type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label><p className="radar-muted">Hora de este dispositivo ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Puedes pausar la programación y lanzar búsquedas manuales.</p></div> : null}
          <label className="radar-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Permitir análisis externo de estos datos</label><p className="radar-step-description">Se consultarán hasta {objectives.length * 4} búsquedas web. Las ejecuciones consumen el saldo de la organización según su configuración.</p>
        </> : null}
        {!available ? <p className="radar-notice" role="status">La búsqueda web todavía no está conectada. Puedes preparar el radar; para activarlo necesitas conectar el buscador.</p> : null}
        {error ? <p className="radar-notice is-error" role="alert">{error}</p> : null}
        </div></section>
        <footer className="radar-modal-footer"><button type="button" onClick={() => step ? goTo(step - 1) : setOpen(false)}><RiArrowLeftLine />{step ? 'Atrás' : 'Cerrar por ahora'}</button><span>{objectives.length} objetivos · {draft.location || 'Sin mercado'}</span>{step < 3 ? <button type="submit" className="radar-primary" disabled={!business || (step > 0 && !objectives.length)}>{step === 1 ? `Continuar con ${objectives.length} objetivos` : 'Continuar'}<RiArrowRightLine /></button> : <button type="submit" className="radar-primary" value={showSchedule ? 'schedule' : 'manual'} disabled={!ready}>{starting ? 'Guardando solicitud…' : activeJob ? 'Búsqueda en curso' : showSchedule ? 'Guardar programación' : 'Buscar oportunidades'}<RiRadarLine /></button>}</footer>
      </fieldset></form>
    </dialog>
  </>
}

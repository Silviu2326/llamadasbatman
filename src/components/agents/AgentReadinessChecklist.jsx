import {
  RiArrowRightSLine,
  RiBookOpenLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiLightbulbFlashLine,
  RiPhoneLine,
  RiShieldCheckLine,
  RiUserLine,
  RiVolumeUpLine,
} from 'react-icons/ri'
import './agent-readiness.css'

const LANGUAGE_LABELS = { es: 'Español', 'es-es': 'Español', en: 'English', 'en-us': 'English', 'en-gb': 'English' }
const clean = value => typeof value === 'string' ? value.trim() : value
const firstValue = (...values) => values.find(value => value !== undefined && value !== null && clean(value) !== '')
const countFrom = value => Array.isArray(value) ? value.length : typeof value === 'number' ? value : 0

function sourceCount(agent, draft, settings) {
  const collections = [agent?.sources, draft?.sources, agent?.documents, draft?.documents, agent?.docs, draft?.docs, settings.knowledge, settings.sources]
  const collectionCount = Math.max(...collections.map(countFrom), 0)
  const numericCount = Math.max(Number(agent?.knowledgeCount) || 0, Number(draft?.knowledgeCount) || 0, Number(agent?.sourcesCount) || 0, Number(draft?.sourcesCount) || 0, Number(agent?.extraDocs) || 0, Number(draft?.extraDocs) || 0, Number(settings.knowledgeCount) || 0, Number(settings.sourcesCount) || 0)
  return Math.max(collectionCount, numericCount)
}

function hasPassedCallTest(agent, draft, settings) {
  const status = String(firstValue(draft?.lastTestStatus, agent?.lastTestStatus, settings.lastTestStatus, draft?.testStatus, agent?.testStatus, settings.testStatus) || '').toLowerCase()
  const passedStatus = ['passed', 'pass', 'success', 'successful', 'ok', 'completada', 'completado', 'superada', 'superado']
  return [draft?.testPassed, draft?.hasPassedTest, draft?.callTestPassed, agent?.testPassed, agent?.hasPassedTest, agent?.callTestPassed, settings.testPassed, settings.hasPassedTest].some(value => value === true) || passedStatus.includes(status)
}

function isPublished(agent, draft, settings) {
  if ([agent?.isPublished, draft?.isPublished, settings.isPublished].some(value => value === true)) return true
  if ([agent?.publishedAt, draft?.publishedAt, settings.publishedAt].some(Boolean)) return true
  const status = String(firstValue(draft?.status, agent?.status, settings.status) || '').toLowerCase()
  return ['published', 'publicado', 'publicada', 'active', 'activo', 'activa', 'live'].includes(status) || agent?.isActive === true || draft?.isActive === true
}

/** Derives the six operational checks from persisted agent data only. */
export function getAgentReadiness(agent = {}, draft = {}) {
  const settings = { ...(agent.settings || {}), ...(draft.settings || {}) }
  const name = clean(firstValue(draft.name, agent.name))
  const role = clean(firstValue(draft.role, draft.subrole, agent.role, agent.subrole, agent.agentType))
  const language = String(firstValue(draft.language, agent.language) || '').toLowerCase()
  const voiceId = clean(firstValue(draft.voiceId, agent.voiceId, settings.voiceId))
  const instructions = clean(firstValue(draft.systemPrompt, draft.objective, draft.objetivo, agent.systemPrompt, agent.objective, agent.objetivo))
  const playbookId = firstValue(draft.activePlaybookId, draft.playbookId, agent.activePlaybookId, agent.playbookId, settings.activePlaybookId, settings.playbookId)
  const sources = sourceCount(agent, draft, settings)
  const languageName = LANGUAGE_LABELS[language] || (language ? language.toUpperCase() : '')
  const callTestReady = hasPassedCallTest(agent, draft, settings)
  const publicationReady = isPublished(agent, draft, settings)

  return [
    { id: 'identity', title: 'Identidad del agente', description: 'Nombre y rol para que el agente se presente con contexto.', detail: name && role ? `${name} · ${role}` : 'Falta nombre o rol', ready: Boolean(name && role), cta: 'Completar identidad', Icon: RiUserLine },
    { id: 'language-voice', title: 'Idioma y voz', description: 'Idioma de conversación y una voz de Fish Audio configurada.', detail: languageName && voiceId ? `${languageName} · voz configurada` : 'Falta idioma o voz', ready: Boolean(language && voiceId), cta: 'Configurar voz', Icon: RiVolumeUpLine },
    { id: 'instructions', title: 'Instrucciones y objetivo', description: 'Un objetivo explícito para guiar las respuestas y el siguiente paso.', detail: instructions ? 'Objetivo definido' : 'Aún no hay instrucciones propias', ready: Boolean(instructions), cta: 'Definir objetivo', Icon: RiLightbulbFlashLine },
    { id: 'sources-playbook', title: 'Fuentes o playbook', description: 'Contexto operativo que el agente puede consultar durante la llamada.', detail: playbookId ? 'Playbook conectado' : sources ? `${sources} ${sources === 1 ? 'fuente conectada' : 'fuentes conectadas'}` : 'Sin fuentes ni playbook', ready: Boolean(playbookId || sources > 0), cta: 'Conectar contexto', Icon: RiBookOpenLine },
    { id: 'call-test', title: 'Prueba de llamada', description: 'Una prueba superada antes de poner el agente a trabajar.', detail: callTestReady ? 'Última prueba superada' : 'Todavía no hay una prueba superada', ready: callTestReady, cta: 'Probar agente', Icon: RiPhoneLine },
    { id: 'publication', title: 'Publicación', description: 'El agente está activo y disponible para recibir llamadas.', detail: publicationReady ? 'Activo y disponible' : 'Pendiente de activar', ready: publicationReady, cta: 'Activar agente', Icon: RiShieldCheckLine },
  ]
}

function ReadinessItem({ item, onNavigate }) {
  const { Icon } = item
  const handleNavigate = () => { if (typeof onNavigate === 'function') onNavigate(item.id) }
  return <article className={`agent-readiness-item${item.ready ? ' is-ready' : ' is-pending'}`}>
    <div className="agent-readiness-item-icon" aria-hidden="true"><Icon /></div>
    <div className="agent-readiness-item-copy">
      <div className="agent-readiness-item-title-row"><h3>{item.title}</h3><span className="agent-readiness-status">{item.ready ? <RiCheckLine aria-hidden="true" /> : <RiErrorWarningLine aria-hidden="true" />}{item.ready ? 'Listo' : 'Pendiente'}</span></div>
      <p>{item.description}</p><small>{item.detail}</small>
    </div>
    {!item.ready ? <button type="button" className="agent-readiness-cta" onClick={handleNavigate} disabled={typeof onNavigate !== 'function'}>{item.cta}<RiArrowRightSLine aria-hidden="true" /></button> : null}
  </article>
}

export default function AgentReadinessChecklist({ agent = {}, draft = {}, onNavigate }) {
  const items = getAgentReadiness(agent, draft)
  const readyCount = items.filter(item => item.ready).length
  const total = items.length
  const progress = Math.round((readyCount / total) * 100)
  return <section className="agent-readiness" aria-labelledby="agent-readiness-title">
    <header className="agent-readiness-header"><div className="agent-readiness-heading"><span className="agent-readiness-kicker"><RiShieldCheckLine aria-hidden="true" /> CONTROL OPERATIVO</span><h2 id="agent-readiness-title">Listo para operar</h2><p>Revisa lo esencial antes de activar conversaciones reales.</p></div><div className="agent-readiness-score" aria-label={`${readyCount} de ${total} requisitos listos`}><strong>{readyCount}<span>/{total}</span></strong><small>listos</small></div></header>
    <div className="agent-readiness-progress" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={readyCount} aria-label="Progreso de configuración"><span style={{ width: `${progress}%` }} /></div>
    <div className="agent-readiness-list">{items.map(item => <ReadinessItem key={item.id} item={item} onNavigate={onNavigate} />)}</div>
    <footer className={`agent-readiness-footer${readyCount === total ? ' is-complete' : ''}`}><span className="agent-readiness-footer-mark" aria-hidden="true">{readyCount === total ? <RiCheckLine /> : <RiErrorWarningLine />}</span><p>{readyCount === total ? 'Todo está preparado para publicar este agente.' : `Completa ${total - readyCount} ${total - readyCount === 1 ? 'pendiente' : 'pendientes'} para dejarlo listo.`}</p></footer>
  </section>
}

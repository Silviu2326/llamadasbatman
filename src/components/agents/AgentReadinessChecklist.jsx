import {
  RiArrowRightSLine,
  RiCheckLine,
  RiErrorWarningLine,
  RiLightbulbFlashLine,
  RiPhoneLine,
  RiShieldCheckLine,
  RiUserLine,
  RiVolumeUpLine,
} from 'react-icons/ri'
import './agent-readiness.css'

import { LIFECYCLE, lifecycleOf } from './agentLifecycle'

// Presentación de cada check del backend (`readiness.checks[].key` en
// GET /agents/:id/workspace). El texto de detalle viene calculado del servidor;
// aquí solo se decide icono, descripción y a qué sección lleva el botón.
const CHECK_PRESENTATION = {
  voice: { title: 'Voz seleccionada', description: 'Una voz del catálogo o una voz propia subida y autorizada.', cta: 'Configurar voz', target: 'language-voice', Icon: RiVolumeUpLine },
  instructions: { title: 'Instrucciones completas', description: 'Qué debe hacer el agente en cada llamada.', cta: 'Definir instrucciones', target: 'instructions', Icon: RiLightbulbFlashLine },
  phone: { title: 'Número desde el que llama', description: 'Número de salida en formato internacional.', cta: 'Asignar número', target: 'basic', Icon: RiPhoneLine },
  outboundNumber: { title: 'Número disponible en la pasarela', description: 'La pasarela solo marca desde la línea configurada en el servidor.', cta: 'Corregir número', target: 'basic', Icon: RiPhoneLine },
  runtimeCredentials: { title: 'Proveedores de voz e IA', description: 'Los proveedores elegidos deben tener credenciales en el servidor.', cta: 'Revisar pipeline', target: 'language-voice', Icon: RiUserLine },
  consent: { title: 'Consentimiento de voz', description: 'Autorización vigente de la persona cuya voz se usa.', cta: 'Registrar autorización', target: 'consent', Icon: RiShieldCheckLine },
  test: { title: 'Prueba real evaluada', description: 'Una llamada telefónica real a un número propio, evaluada después de los últimos cambios. La cabina del navegador no cuenta.', cta: 'Hacer la prueba real', target: 'call-test', Icon: RiPhoneLine },
}

/**
 * Deriva los pasos del checklist del workspace del backend: los checks de
 * readiness, los bloqueos de la llamada de prueba y el estado real de
 * publicación. Sin workspace no se inventa nada: se muestra como pendiente de
 * cargar.
 */
export function getAgentReadiness(workspace) {
  if (!workspace?.readiness?.checks) return []
  const checks = workspace.readiness.checks.map(check => {
    const presentation = CHECK_PRESENTATION[check.key] || { title: check.label, description: '', cta: 'Revisar', target: 'basic', Icon: RiErrorWarningLine }
    return { id: check.key, ...presentation, title: presentation.title || check.label, detail: check.detail || (check.ready ? 'Completado' : 'Pendiente'), ready: Boolean(check.ready), informative: Boolean(check.informative) }
  })
  const testBlockers = (workspace.testCall?.blockers || []).filter(item => !checks.some(check => !check.ready && check.detail === item && check.id !== 'test'))
  const testIndex = checks.findIndex(check => check.id === 'test')
  if (testIndex >= 0 && !checks[testIndex].ready && testBlockers.length) {
    const numberBlocker = testBlockers.find(item => /número propio|Máximo de/.test(item))
    if (numberBlocker) checks[testIndex] = { ...checks[testIndex], detail: `${numberBlocker}. ${checks[testIndex].detail}`, cta: /número propio/.test(numberBlocker) ? 'Autorizar un número de prueba' : checks[testIndex].cta }
  }
  const status = lifecycleOf(workspace.agent)
  checks.push({
    id: 'publication', title: 'Publicación', description: 'Solo un agente publicado puede recibir campañas.', Icon: RiShieldCheckLine,
    ready: status === 'active', detail: LIFECYCLE[status].description,
    cta: status === 'paused' ? 'Reanudar agente' : status === 'archived' ? 'Agente archivado' : 'Publicar agente', target: 'publication',
    disabled: status === 'archived' || (status === 'draft' && !workspace.readiness.ready),
  })
  return checks
}

function ReadinessItem({ item, onNavigate }) {
  const { Icon } = item
  const handleNavigate = () => { if (typeof onNavigate === 'function') onNavigate(item.target || item.id) }
  return <article className={`agent-readiness-item${item.ready ? ' is-ready' : ' is-pending'}`}>
    <div className="agent-readiness-item-icon" aria-hidden="true"><Icon /></div>
    <div className="agent-readiness-item-copy">
      <div className="agent-readiness-item-title-row"><h3>{item.title}</h3><span className="agent-readiness-status">{item.ready ? <RiCheckLine aria-hidden="true" /> : <RiErrorWarningLine aria-hidden="true" />}{item.ready ? (item.informative ? 'Sin comprobar' : 'Listo') : 'Pendiente'}</span></div>
      <p>{item.description}</p><small>{item.detail}</small>
    </div>
    {!item.ready ? <button type="button" className="agent-readiness-cta" onClick={handleNavigate} disabled={typeof onNavigate !== 'function' || item.disabled}>{item.cta}<RiArrowRightSLine aria-hidden="true" /></button> : null}
  </article>
}

/**
 * Checklist «Listo para operar». Lee exclusivamente el workspace del backend
 * (readiness.checks + testCall.blockers + lifecycleStatus): si el backend dice
 * que la prueba está pendiente, aquí está pendiente, y el botón lleva a la
 * prueba real, no a la cabina.
 */
export default function AgentReadinessChecklist({ workspace, onNavigate }) {
  const items = getAgentReadiness(workspace)
  if (!items.length) {
    return <section className="agent-readiness" aria-labelledby="agent-readiness-title">
      <header className="agent-readiness-header"><div className="agent-readiness-heading"><span className="agent-readiness-kicker"><RiShieldCheckLine aria-hidden="true" /> CONTROL OPERATIVO</span><h2 id="agent-readiness-title">Listo para operar</h2><p>Cargando los requisitos del agente…</p></div></header>
    </section>
  }
  const readyCount = items.filter(item => item.ready).length
  const total = items.length
  const progress = Math.round((readyCount / total) * 100)
  const publication = items.find(item => item.id === 'publication')
  const footerText = readyCount === total ? 'El agente está publicado y cumple todos los requisitos.'
    : publication && !publication.ready && readyCount === total - 1 ? 'Todos los requisitos están listos: ya puedes publicar este agente.'
      : `Completa ${total - readyCount - (publication && !publication.ready ? 1 : 0)} ${total - readyCount - (publication && !publication.ready ? 1 : 0) === 1 ? 'pendiente' : 'pendientes'} para poder publicarlo.`
  return <section className="agent-readiness" aria-labelledby="agent-readiness-title">
    <header className="agent-readiness-header"><div className="agent-readiness-heading"><span className="agent-readiness-kicker"><RiShieldCheckLine aria-hidden="true" /> CONTROL OPERATIVO</span><h2 id="agent-readiness-title">Listo para operar</h2><p>Los mismos requisitos que aplica el servidor al publicar.</p></div><div className="agent-readiness-score" aria-label={`${readyCount} de ${total} requisitos listos`}><strong>{readyCount}<span>/{total}</span></strong><small>listos</small></div></header>
    <div className="agent-readiness-progress" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={readyCount} aria-label="Progreso de configuración"><span style={{ width: `${progress}%` }} /></div>
    <div className="agent-readiness-list">{items.map(item => <ReadinessItem key={item.id} item={item} onNavigate={onNavigate} />)}</div>
    <footer className={`agent-readiness-footer${readyCount === total ? ' is-complete' : ''}`}><span className="agent-readiness-footer-mark" aria-hidden="true">{readyCount === total ? <RiCheckLine /> : <RiErrorWarningLine />}</span><p>{footerText}</p></footer>
  </section>
}

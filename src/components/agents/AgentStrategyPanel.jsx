import { useEffect, useMemo, useState } from 'react'
import {
  RiArrowRightSLine, RiBarChartLine, RiBookOpenLine, RiCheckLine,
  RiCheckboxCircleLine, RiFlashlightLine, RiPhoneLine, RiRouteLine,
} from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { strategiesForAgent, strategyForAgent } from '../../lib/callStrategies'

function StrategyMetric({ label, value, Icon }) {
  return <div className="agent-strategy-metric"><span>{label}</span><strong>{value}</strong><Icon /></div>
}

function TextareaField({ label, value, onChange, placeholder }) {
  return <label className="agent-field"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>
}

export default function AgentStrategyPanel({ agent, onEdit, playbooks = [], onNavigate }) {
  const settings = agent.settings || {}
  const available = useMemo(
    () => strategiesForAgent(agent.agentType, agent.callDirection),
    [agent.agentType, agent.callDirection],
  )
  const selected = strategyForAgent(settings.strategyId, agent.agentType, agent.callDirection)
  const activePlaybook = playbooks.find(playbook => playbook.id === settings.activePlaybookId)
  const [performance, setPerformance] = useState(null)

  useEffect(() => {
    let active = true
    setPerformance(null)
    apiFetch(`/api/agents/${agent.id}/strategy-performance?days=30`)
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active) setPerformance(data) })
      .catch(() => { if (active) setPerformance(false) })
    return () => { active = false }
  }, [agent.id])

  const currentStats = performance?.strategies?.find(item => item.strategyId === selected.id)
  const updateSettings = patch => onEdit({ settings: { ...settings, ...patch } })

  return <div className="agent-strategy-studio">
    <section className="agent-strategy-library" aria-labelledby="agent-strategies-title">
      <div className="agent-strategy-section-head">
        <div><h3 id="agent-strategies-title">Estrategias de llamada</h3><p>Selecciona el método que guiará al agente en cada conversación.</p></div>
        <span>{available.length} compatibles</span>
      </div>
      <div className="agent-strategy-options">
        {available.map((strategy, index) => {
          const isSelected = selected.id === strategy.id
          return <button
            key={strategy.id}
            type="button"
            className={`agent-strategy-option${isSelected ? ' is-selected' : ''}`}
            onClick={() => updateSettings({ strategyId: strategy.id })}
            aria-pressed={isSelected}
          >
            <span className="agent-strategy-index">{index + 1}</span>
            <span className="agent-strategy-option-copy"><strong>{strategy.label}</strong><small>{strategy.summary}</small></span>
            <span className="agent-strategy-select-mark">{isSelected ? <RiCheckLine /> : null}</span>
          </button>
        })}
      </div>
    </section>

    <aside className="agent-strategy-rail">
      <section className="agent-call-plan">
        <div className="agent-strategy-section-head"><div><h3>Plan de llamada</h3><p>{selected.label}</p></div><RiRouteLine /></div>
        <ol>{selected.stages.map((stage, index) => <li key={stage.label}><span>{index + 1}</span><div><strong>{stage.label}</strong><small>{stage.instruction}</small></div></li>)}</ol>
        <div className="agent-strategy-outcome"><RiCheckboxCircleLine /><span><small>Resultado esperado</small><strong>{selected.expectedOutcome}</strong></span></div>
      </section>

      <section className="agent-connected-playbook">
        <div className="agent-strategy-section-head"><div><h3>Playbook personalizado</h3><p>Se combina con la estrategia sin sustituirla.</p></div><RiBookOpenLine /></div>
        <label className="agent-playbook-select">
          <RiBookOpenLine />
          <span><small>Playbook activo</small><select value={settings.activePlaybookId || ''} onChange={event => updateSettings({ activePlaybookId: event.target.value || null, activePlaybookVersion: 1 })}><option value="">Sin playbook personalizado</option>{playbooks.map(playbook => <option key={playbook.id} value={playbook.id}>{playbook.name}</option>)}</select></span>
          {activePlaybook ? <b><RiCheckLine /> Conectado</b> : <RiArrowRightSLine />}
        </label>
        {!playbooks.length ? <button type="button" className="agent-playbook-link" onClick={() => onNavigate('/playbooks')}>Crear el primer playbook <RiArrowRightSLine /></button> : null}
      </section>

      <section className="agent-strategy-performance">
        <div className="agent-strategy-section-head"><div><h3>Rendimiento · 30 días</h3><p>Solo llamadas atribuidas a esta estrategia.</p></div><RiBarChartLine /></div>
        <div className="agent-strategy-metrics">
          <StrategyMetric label="Llamadas" value={currentStats?.calls ?? 0} Icon={RiPhoneLine} />
          <StrategyMetric label="Éxito" value={`${currentStats?.successRate ?? 0}%`} Icon={RiBarChartLine} />
          <StrategyMetric label="Reuniones" value={currentStats?.meetings ?? 0} Icon={RiCheckboxCircleLine} />
        </div>
        {performance === false ? <p className="agent-strategy-data-note">No se pudo cargar el rendimiento.</p> : null}
        {performance && !currentStats ? <p className="agent-strategy-data-note">La atribución empezará en la próxima llamada con esta estrategia.</p> : null}
      </section>
    </aside>

    <section className="agent-strategy-advanced">
      <div className="agent-strategy-section-head"><div><h3>Instrucciones propias del agente</h3><p>Matices que se aplican después del rol, la estrategia y el playbook.</p></div><RiFlashlightLine /></div>
      <div className="agent-strategy-advanced-grid">
        <TextareaField label="Objetivo e instrucciones adicionales" value={agent.systemPrompt || ''} onChange={value => onEdit({ systemPrompt: value })} placeholder="Qué debe conseguir o priorizar este agente…" />
        <TextareaField label="Cuándo escalar a una persona" value={settings.escalationRules || ''} onChange={value => updateSettings({ escalationRules: value })} placeholder="Escala si el cliente pide una excepción, está frustrado…" />
      </div>
    </section>
  </div>
}

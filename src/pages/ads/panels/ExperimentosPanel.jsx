import { useState } from 'react'
import { RiAddLine, RiFlaskLine } from 'react-icons/ri'

// Experimentos: dos formas de aprender (ads.md §12). La distribución ordinaria
// de Meta NO es un A/B: Meta entrega más impresiones a lo que predice que
// funcionará y eso introduce sesgo. La pantalla dice qué método usa cada
// prueba de verdad y no llama experimento a lo que no lo es.

const STATUS_LABELS = {
  draft: 'Borrador',
  running: 'En marcha',
  concluded: 'Concluido',
  inconclusive: 'Sin conclusión',
  stopped: 'Detenido',
}
const METRIC_LABELS = { qualified_lead: 'Lead cualificado', lead: 'Lead', sale: 'Venta' }

const EMPTY_FORM = { name: '', hypothesis: '', mode: 'bandit', primaryMetric: 'qualified_lead', variantA: '', variantB: '' }

function CreateExperimentForm({ overview, plan, onDone }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const busy = overview.busyExperiment === 'new'
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    if (form.hypothesis.trim().length < 5) { setError('Escribe una hipótesis de al menos 5 caracteres.'); return }
    if (!form.variantA.trim() || !form.variantB.trim()) { setError('Hacen falta dos variantes con nombre.'); return }
    setError('')
    const created = await overview.createExperiment({
      name: form.name.trim(),
      hypothesis: form.hypothesis.trim(),
      mode: form.mode,
      primaryMetric: form.primaryMetric,
      ...(plan?.selectedId ? { campaignId: plan.selectedId } : {}),
      variants: [
        { key: 'a', label: form.variantA.trim() },
        { key: 'b', label: form.variantB.trim() },
      ],
    })
    if (created) { setForm(EMPTY_FORM); onDone() }
  }

  return <form className="gs-panel gs-rise" onSubmit={submit}>
    <div className="gs-panel-head"><div>
      <h2>Nuevo experimento</h2>
      <p>Se crea en borrador{plan?.selectedCampaign?.name ? <> para <b>{plan.selectedCampaign.name}</b></> : ' a nivel de organización'}. Arráncalo cuando las variantes existan en Meta.</p>
    </div></div>
    <div className="gs-panel-body">
      {error ? <p className="gs-alert is-error" role="alert">{error}</p> : null}
      <div className="gs-form-grid">
        <label className="full">Nombre <i>*</i>
          <input className="gs-input" value={form.name} onChange={set('name')} required maxLength={160} placeholder="Ej.: Ángulo precio frente a ángulo rapidez" />
        </label>
        <label className="full">Hipótesis <i>*</i>
          <input className="gs-input" value={form.hypothesis} onChange={set('hypothesis')} required maxLength={600} placeholder="Ej.: hablar de rapidez baja el coste por lead cualificado" />
        </label>
        <label>Método
          <select className="gs-input" value={form.mode} onChange={set('mode')}>
            <option value="bandit">Torneo (bandit)</option>
            <option value="experiment">Experimento aleatorizado</option>
          </select>
        </label>
        <label>Métrica que decide
          <select className="gs-input" value={form.primaryMetric} onChange={set('primaryMetric')}>
            {Object.entries(METRIC_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Variante A <i>*</i>
          <input className="gs-input" value={form.variantA} onChange={set('variantA')} required maxLength={120} placeholder="Ej.: Precio" />
        </label>
        <label>Variante B <i>*</i>
          <input className="gs-input" value={form.variantB} onChange={set('variantB')} required maxLength={120} placeholder="Ej.: Rapidez" />
        </label>
      </div>
      <div className="ah-actions">
        <button type="button" className="gs-button ghost" onClick={onDone}>Cancelar</button>
        <button type="submit" className="gs-button primary" disabled={busy}>{busy ? 'Creando…' : 'Crear experimento'}</button>
      </div>
    </div>
  </form>
}

function ExperimentRow({ experiment, overview }) {
  const [confirming, setConfirming] = useState(false)
  const busy = overview.busyExperiment === experiment.id
  const open = experiment.status === 'draft' || experiment.status === 'running'
  const winner = experiment.winnerVariantId ? experiment.variants?.find(v => v.id === experiment.winnerVariantId) : null

  return <div className="ah-row">
    <div className="ah-row-main">
      <strong>{experiment.name} <span className="gs-pill tone-violet">{experiment.label}</span></strong>
      <small>{experiment.hypothesis}</small>
      <small>{experiment.caveat}</small>
      {experiment.conclusion ? <small><b>{winner ? `Ganadora: ${winner.label}. ` : ''}</b>{experiment.conclusion}</small> : null}
    </div>
    <span className="ah-row-meta">
      {STATUS_LABELS[experiment.status] ?? experiment.status} · {METRIC_LABELS[experiment.primaryMetric] ?? experiment.primaryMetric}
      {experiment.campaign?.name ? <><br />{experiment.campaign.name}</> : null}
      <br />{(experiment.variants ?? []).map(v => `${v.label} ${v.allocationPercent} %`).join(' · ')}
    </span>
    {open ? <div className="ah-actions">
      {experiment.status === 'draft' ? <button type="button" className="gs-button small" disabled={busy} onClick={() => overview.changeExperiment(experiment.id, 'start')}>Arrancar</button> : null}
      {confirming ? <span className="ah-confirm">
        ¿Concluir? Si faltan días o eventos quedará «sin conclusión».
        <button type="button" className="gs-button small danger" disabled={busy} onClick={async () => { await overview.changeExperiment(experiment.id, 'conclude'); setConfirming(false) }}>{busy ? 'Concluyendo…' : 'Sí, concluir'}</button>
        <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => setConfirming(false)}>No</button>
      </span> : <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => setConfirming(true)}>Concluir</button>}
    </div> : null}
  </div>
}

export default function ExperimentosPanel({ overview, plan }) {
  const experiments = overview.experiments ?? []
  const [creating, setCreating] = useState(false)

  return <div className="gs-stack">
    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>Cómo aprende Vendrava</h2>
          <p>Dos métodos con nombre propio; ninguno se confunde con la entrega ordinaria de Meta.</p>
        </div>
        <span className="gs-panel-icon"><RiFlaskLine /></span>
      </div>
      <div className="gs-panel-body">
        <div className="gs-cols-even">
          <div>
            <span className="gs-overline">Experimento</span>
            <p className="gs-muted">División aleatoria predefinida entre variantes, para estimar qué creatividad <b>causa</b> mejores resultados. Es más lento, pero la comparación es limpia.</p>
          </div>
          <div>
            <span className="gs-overline">Bandit / torneo</span>
            <p className="gs-muted">Explotación y exploración: la mayor parte del presupuesto (80–90 %) va a lo que mejor funciona y una parte pequeña (10–20 %) sigue probando alternativas, ajustando según volumen e incertidumbre.</p>
          </div>
        </div>
        <p className="gs-note">La distribución ordinaria de Meta no es ninguna de las dos cosas: Meta reparte impresiones según lo que predice que funcionará, y eso sesga cualquier comparación. Por eso aquí ninguna campaña se llama «A/B» si solo ha recibido esa entrega.</p>
      </div>
    </section>

    {creating ? <CreateExperimentForm overview={overview} plan={plan} onDone={() => setCreating(false)} /> : null}

    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>Experimentos</h2>
          <p>Qué se está probando, con qué método y qué se concluyó. Concluir antes de tiempo deja el resultado como «sin conclusión», nunca inventa una ganadora.</p>
        </div>
        {!creating ? <div className="gs-panel-actions">
          <button type="button" className="gs-button primary" onClick={() => setCreating(true)}><RiAddLine /> Nuevo experimento</button>
        </div> : null}
      </div>
      <div className="gs-panel-body">
        {experiments.length
          ? <div className="ah-list">{experiments.map(experiment => <ExperimentRow key={experiment.id} experiment={experiment} overview={overview} />)}</div>
          : <div className="gs-empty">
            <span><RiFlaskLine /></span>
            <h3>Sin experimentos en marcha</h3>
            <p>Ahora mismo no se está probando nada con método experimental. Crea uno cuando tengas dos variantes que comparar; no se muestra ningún resultado simulado.</p>
          </div>}
      </div>
    </section>
  </div>
}

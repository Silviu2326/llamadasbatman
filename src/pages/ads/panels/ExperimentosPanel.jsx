import { useState } from 'react'
import { RiAddLine, RiFlaskLine } from 'react-icons/ri'

// Experimentos: dos formas de aprender (ads.md §12). La distribución ordinaria
// de Meta NO es un A/B: Meta entrega más impresiones a lo que predice que
// funcionará y eso introduce sesgo. La pantalla dice qué método usa cada
// prueba de verdad y no llama experimento a lo que no lo es.

// Etiquetas en ads.experimentos.status.* y ads.experimentos.metric.*; un
// valor desconocido (dato del servidor) se enseña tal cual.
const STATUS_KEYS = ['draft', 'running', 'concluded', 'inconclusive', 'stopped']
const METRIC_KEYS = ['qualified_lead', 'lead', 'sale']
const statusLabel = (t, status) => (STATUS_KEYS.includes(status) ? t(`ads.experimentos.status.${status}`) : status)
const metricLabel = (t, metric) => (METRIC_KEYS.includes(metric) ? t(`ads.experimentos.metric.${metric}`) : metric)

const EMPTY_FORM = { name: '', hypothesis: '', mode: 'bandit', primaryMetric: 'qualified_lead', variantA: '', variantB: '' }

function CreateExperimentForm({ overview, plan, onDone, t }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const busy = overview.busyExperiment === 'new'
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    if (form.hypothesis.trim().length < 5) { setError(t('ads.experimentos.hypothesisMin')); return }
    if (!form.variantA.trim() || !form.variantB.trim()) { setError(t('ads.experimentos.twoVariants')); return }
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
      <h2>{t('ads.experimentos.newTitle')}</h2>
      <p>{plan?.selectedCampaign?.name ? <>{t('ads.experimentos.draftFor')} <b>{plan.selectedCampaign.name}</b>.</> : t('ads.experimentos.draftOrg')} {t('ads.experimentos.startWhen')}</p>
    </div></div>
    <div className="gs-panel-body">
      {error ? <p className="gs-alert is-error" role="alert">{error}</p> : null}
      <div className="gs-form-grid">
        <label className="full">{t('ads.experimentos.name')} <i>*</i>
          <input className="gs-input" value={form.name} onChange={set('name')} required maxLength={160} placeholder={t('ads.experimentos.namePlaceholder')} />
        </label>
        <label className="full">{t('ads.experimentos.hypothesis')} <i>*</i>
          <input className="gs-input" value={form.hypothesis} onChange={set('hypothesis')} required maxLength={600} placeholder={t('ads.experimentos.hypothesisPlaceholder')} />
        </label>
        <label>{t('ads.experimentos.method')}
          <select className="gs-input" value={form.mode} onChange={set('mode')}>
            <option value="bandit">{t('ads.experimentos.bandit')}</option>
            <option value="experiment">{t('ads.experimentos.randomized')}</option>
          </select>
        </label>
        <label>{t('ads.experimentos.decidingMetric')}
          <select className="gs-input" value={form.primaryMetric} onChange={set('primaryMetric')}>
            {METRIC_KEYS.map(value => <option key={value} value={value}>{metricLabel(t, value)}</option>)}
          </select>
        </label>
        <label>{t('ads.experimentos.variantA')} <i>*</i>
          <input className="gs-input" value={form.variantA} onChange={set('variantA')} required maxLength={120} placeholder={t('ads.experimentos.variantAPlaceholder')} />
        </label>
        <label>{t('ads.experimentos.variantB')} <i>*</i>
          <input className="gs-input" value={form.variantB} onChange={set('variantB')} required maxLength={120} placeholder={t('ads.experimentos.variantBPlaceholder')} />
        </label>
      </div>
      <div className="ah-actions">
        <button type="button" className="gs-button ghost" onClick={onDone}>{t('ads.common.cancel')}</button>
        <button type="submit" className="gs-button primary" disabled={busy}>{busy ? t('ads.common.creating') : t('ads.experimentos.create')}</button>
      </div>
    </div>
  </form>
}

function ExperimentRow({ experiment, overview, t }) {
  const [confirming, setConfirming] = useState(false)
  const busy = overview.busyExperiment === experiment.id
  const open = experiment.status === 'draft' || experiment.status === 'running'
  const winner = experiment.winnerVariantId ? experiment.variants?.find(v => v.id === experiment.winnerVariantId) : null

  return <div className="ah-row">
    <div className="ah-row-main">
      <strong>{experiment.name} <span className="gs-pill tone-violet">{experiment.label}</span></strong>
      <small>{experiment.hypothesis}</small>
      <small>{experiment.caveat}</small>
      {experiment.conclusion ? <small><b>{winner ? `${t('ads.experimentos.winner', { label: winner.label })} ` : ''}</b>{experiment.conclusion}</small> : null}
    </div>
    <span className="ah-row-meta">
      {statusLabel(t, experiment.status)} · {metricLabel(t, experiment.primaryMetric)}
      {experiment.campaign?.name ? <><br />{experiment.campaign.name}</> : null}
      <br />{(experiment.variants ?? []).map(v => `${v.label} ${v.allocationPercent} %`).join(' · ')}
    </span>
    {open ? <div className="ah-actions">
      {experiment.status === 'draft' ? <button type="button" className="gs-button small" disabled={busy} onClick={() => overview.changeExperiment(experiment.id, 'start')}>{t('ads.experimentos.start')}</button> : null}
      {confirming ? <span className="ah-confirm">
        {t('ads.experimentos.concludeQuestion')}
        <button type="button" className="gs-button small danger" disabled={busy} onClick={async () => { await overview.changeExperiment(experiment.id, 'conclude'); setConfirming(false) }}>{busy ? t('ads.experimentos.concluding') : t('ads.experimentos.yesConclude')}</button>
        <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => setConfirming(false)}>{t('ads.common.no')}</button>
      </span> : <button type="button" className="gs-button small ghost" disabled={busy} onClick={() => setConfirming(true)}>{t('ads.experimentos.conclude')}</button>}
    </div> : null}
  </div>
}

export default function ExperimentosPanel({ overview, plan, ui }) {
  const { t } = ui
  const experiments = overview.experiments ?? []
  const [creating, setCreating] = useState(false)

  return <div className="gs-stack">
    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>{t('ads.experimentos.howTitle')}</h2>
          <p>{t('ads.experimentos.howText')}</p>
        </div>
        <span className="gs-panel-icon"><RiFlaskLine /></span>
      </div>
      <div className="gs-panel-body">
        <div className="gs-cols-even">
          <div>
            <span className="gs-overline">{t('ads.experimentos.experiment')}</span>
            <p className="gs-muted">{t('ads.experimentos.experimentText')}</p>
          </div>
          <div>
            <span className="gs-overline">{t('ads.experimentos.banditTitle')}</span>
            <p className="gs-muted">{t('ads.experimentos.banditText')}</p>
          </div>
        </div>
        <p className="gs-note">{t('ads.experimentos.note')}</p>
      </div>
    </section>

    {creating ? <CreateExperimentForm overview={overview} plan={plan} onDone={() => setCreating(false)} t={t} /> : null}

    <section className="gs-panel">
      <div className="gs-panel-head">
        <div>
          <h2>{t('ads.experimentos.listTitle')}</h2>
          <p>{t('ads.experimentos.listText')}</p>
        </div>
        {!creating ? <div className="gs-panel-actions">
          <button type="button" className="gs-button primary" onClick={() => setCreating(true)}><RiAddLine /> {t('ads.experimentos.newButton')}</button>
        </div> : null}
      </div>
      <div className="gs-panel-body">
        {experiments.length
          ? <div className="ah-list">{experiments.map(experiment => <ExperimentRow key={experiment.id} experiment={experiment} overview={overview} t={t} />)}</div>
          : <div className="gs-empty">
            <span><RiFlaskLine /></span>
            <h3>{t('ads.experimentos.emptyTitle')}</h3>
            <p>{t('ads.experimentos.emptyText')}</p>
          </div>}
      </div>
    </section>
  </div>
}

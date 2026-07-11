import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiRocketLine, RiSendPlaneLine, RiAlertLine, RiCheckLine,
  RiMoneyDollarCircleLine, RiBriefcaseLine, RiCrosshairLine, RiMetaLine,
} from 'react-icons/ri'
import '../dashboard.css'

export default function AdsWizardPage() {
  const navigate = useNavigate()
  const [vertical, setVertical] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  const [playbooks, setPlaybooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [metaAccount, setMetaAccount] = useState(undefined) // undefined = cargando, null = sin conectar

  useEffect(() => {
    apiFetch('/api/ad-playbooks')
      .then(r => r.ok ? r.json() : [])
      .then(data => setPlaybooks(Array.isArray(data) ? data : []))
      .catch(() => {})
    apiFetch('/api/meta/accounts')
      .then(r => r.ok ? r.json() : null)
      .then(setMetaAccount)
      .catch(() => setMetaAccount(null))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!vertical.trim() || !objetivo.trim() || !presupuesto) return
    setLoading(true); setMessage('')
    try {
      const res = await apiFetch('/api/ads/wizard', {
        method: 'POST',
        body: JSON.stringify({
          vertical: vertical.trim(),
          objetivo: objetivo.trim(),
          presupuestoMensual: Number(presupuesto),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudo crear la campaña')
      }
      const campaign = await res.json()
      if (campaign.adStatus === 'draft' && !campaign.metaCampaignId) {
        setMessage('Campaña creada en borrador. Conectá una cuenta de Meta para publicarla.')
      }
      navigate(`/campanas/${campaign.id}?tab=anuncio`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #ec4899, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RiRocketLine style={{ width: 22, height: 22, color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Nueva campaña de captación</h1>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>Crear campaña publicitaria en Meta Ads en unos pasos.</p>
        </div>
      </div>

      {metaAccount !== undefined && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, maxWidth: 560,
          padding: '10px 14px', borderRadius: 10,
          background: metaAccount ? '#10b98115' : '#f59e0b15',
          border: `1px solid ${metaAccount ? '#10b98140' : '#f59e0b40'}`,
          color: metaAccount ? '#10b981' : '#f59e0b', fontSize: 13,
        }}>
          {metaAccount ? <RiCheckLine style={{ width: 16, height: 16, flexShrink: 0 }} /> : <RiMetaLine style={{ width: 16, height: 16, flexShrink: 0 }} />}
          {metaAccount ? (
            <span>Cuenta de Meta conectada ({metaAccount.metaAdAccountId}) — la campaña se puede publicar directamente.</span>
          ) : (
            <span>Todavía no conectaste una cuenta de Meta — podés crear la campaña en borrador, pero no se va a publicar hasta que <Link to="/captacion/conectar" style={{ color: '#f59e0b', fontWeight: 700 }}>la conectes</Link>.</span>
          )}
        </div>
      )}

      {message && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
          padding: '10px 14px', borderRadius: 10,
          background: message.includes('borrador') || message.includes('Conectá') ? '#f59e0b15' : '#ef444415',
          border: message.includes('borrador') || message.includes('Conectá') ? '1px solid #f59e0b40' : '1px solid #ef444440',
          color: message.includes('borrador') || message.includes('Conectá') ? '#f59e0b' : '#ef4444', fontSize: 13,
        }}>
          {message.includes('borrador') || message.includes('Conectá') ? <RiAlertLine style={{ width: 16, height: 16 }} /> : <RiAlertLine style={{ width: 16, height: 16 }} />}
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ maxWidth: 560, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RiBriefcaseLine style={{ width: 14, height: 14 }} /> Vertical / rubro
          </label>
          <input
            list="verticals"
            value={vertical}
            onChange={e => setVertical(e.target.value)}
            placeholder="Ej. clínicas dentales, SaaS B2B..."
            required
            style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '11px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
          <datalist id="verticals">
            {playbooks.map(pb => (
              <option key={pb.id} value={pb.vertical} />
            ))}
          </datalist>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RiCrosshairLine style={{ width: 14, height: 14 }} /> Objetivo de la campaña
          </label>
          <input
            value={objetivo}
            onChange={e => setObjetivo(e.target.value)}
            placeholder="Ej. agendar demos, recuperar leads..."
            required
            style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '11px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RiMoneyDollarCircleLine style={{ width: 14, height: 14 }} /> Presupuesto mensual (€)
          </label>
          <input
            type="number"
            min={1}
            step="0.01"
            value={presupuesto}
            onChange={e => setPresupuesto(e.target.value)}
            placeholder="500"
            required
            style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '11px 14px', color: '#e2e8f0', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
          <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>Se reparte en presupuesto diario automáticamente.</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px', borderRadius: 9, border: 'none',
            background: loading ? '#374151' : 'linear-gradient(90deg, #4f46e5, #7c3aed)', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? (<>Creando…</>) : (<><RiSendPlaneLine style={{ width: 15, height: 15 }} /> Crear campaña</>)}
        </button>
      </form>
    </div>
  )
}

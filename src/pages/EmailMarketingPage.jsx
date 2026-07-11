import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import {
  RiMailLine, RiAlertLine, RiMailOpenLine, RiCursorLine, RiGroupLine,
  RiSendPlaneLine,
} from 'react-icons/ri'
import KPICard from '../components/KPICard'
import { BACKEND_STATUS } from '../lib/leadMapping'
import '../dashboard.css'

// Mautic es una instancia única compartida (decisión 2.2 de
// PLAN_IMPLEMENTACION_POSTIZ_MAUTIC.md), no un workspace por org como Postiz
// — por eso esta página no embebe su UI en un iframe (mostraría contactos de
// otras organizaciones). En cambio muestra el agregado que el CRM ya guarda
// por lead (`customFields.mauticActivity`) y el desglose por segmento.
//
// Reusa los mismos patrones ya probados: KPICard (Dashboard), barras de
// desglose (estilo "Desglose del score" de LeadDetailPage) y el tono de
// estado vacío honesto de Configuración.

const SEGMENT_COLOR = { new: '#94a3b8', contacted: '#06b6d4', qualified: '#f59e0b', unqualified: '#ef4444', converted: '#10b981' }
const KPI_PALETTE = ['#818cf8', '#34d399', '#fbbf24', '#f472b6']

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  return `hace ${days} d`
}

export default function EmailMarketingPage() {
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)
  const [overview, setOverview] = useState(null)

  useEffect(() => {
    apiFetch('/api/mautic')
      .then(async res => {
        if (res.status === 403) { setGated(true); return }
        if (!res.ok) throw new Error()
        setOverview(await res.json())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 14, background: '#080c14' }}>
        Cargando…
      </div>
    )
  }

  if (gated) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080c14', padding: 32 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <RiAlertLine style={{ width: 28, height: 28, color: '#f59e0b', marginBottom: 10 }} />
          <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
            Email marketing es una función del Plan Completo. Hablá con tu administrador para activarla.
          </p>
        </div>
      </div>
    )
  }

  const totalForSegments = overview?.bySegment?.reduce((s, g) => s + g.count, 0) || 0

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RiMailLine style={{ width: 22, height: 22, color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Email marketing</h1>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>Nutrición automática de leads (Mautic).</p>
        </div>
      </div>

      {/* KPIs — mismo componente y fila del Dashboard */}
      <div className="db-kpi-row" style={{ marginBottom: 22 }}>
        {[
          { Icon: RiGroupLine, label: 'Leads totales', value: overview?.totalLeads ?? 0 },
          { Icon: RiSendPlaneLine, label: 'Sincronizables\n(con email)', value: overview?.syncable ?? 0 },
          { Icon: RiMailOpenLine, label: 'Aperturas', value: overview?.opens ?? 0 },
          { Icon: RiCursorLine, label: 'Clics', value: overview?.clicks ?? 0 },
        ].map((k, idx) => (
          <div key={k.label} style={{ flex: '1 1 160px' }}>
            <KPICard Icon={k.Icon} iconBg={KPI_PALETTE[idx]} color={KPI_PALETTE[idx]} label={k.label} value={String(k.value)} pct={null} data={null} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, flexWrap: 'wrap' }}>
        {/* Por segmento — mismo patrón de barras que "Desglose del score" en LeadDetailPage */}
        <div style={{ flex: '1 1 320px', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '18px' }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Por segmento</p>
          {!overview?.bySegment?.length ? (
            <p style={{ color: '#4b5563', fontSize: 13 }}>Sin leads todavía.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {overview.bySegment.map(g => {
                const pct = totalForSegments > 0 ? Math.round((g.count / totalForSegments) * 100) : 0
                const color = SEGMENT_COLOR[g.status] ?? '#6366f1'
                return (
                  <div key={g.status}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{BACKEND_STATUS[g.status] ?? g.status}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>{g.count}</span>
                    </div>
                    <div style={{ height: 6, background: '#1e2433', borderRadius: 99 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .5s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Actividad reciente */}
        <div style={{ flex: '2 1 420px', background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '18px', display: 'flex', flexDirection: 'column' }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Actividad reciente</p>
          {!overview?.recentActivity?.length ? (
            <p style={{ color: '#4b5563', fontSize: 13 }}>Sin aperturas ni clics todavía.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overview.recentActivity.map((a, i) => (
                <Link
                  key={i}
                  to={`/leads/${a.leadId}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: '#111827', border: '1px solid #1a2235', borderRadius: 10, textDecoration: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {a.type === 'open'
                      ? <RiMailOpenLine style={{ width: 15, height: 15, color: '#818cf8', flexShrink: 0 }} />
                      : <RiCursorLine style={{ width: 15, height: 15, color: '#34d399', flexShrink: 0 }} />}
                    <span style={{ fontSize: 12.5, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <span style={{ fontSize: 11.5, color: '#6b7280' }}>{a.type === 'open' ? 'abrió' : 'hizo clic'}{a.detail ? ` — ${a.detail}` : ''}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#4b5563', flexShrink: 0 }}>{timeAgo(a.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

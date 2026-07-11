import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import {
  RiShareForwardLine, RiAlertLine, RiBarChartLine, RiRefreshLine, RiCheckLine,
  RiInstagramLine, RiFacebookBoxFill, RiLinkedinBoxFill, RiTwitterXFill,
  RiTiktokFill, RiYoutubeFill, RiGlobalLine,
} from 'react-icons/ri'
import KPICard from '../components/KPICard'
import '../dashboard.css'

// Postiz resuelve el calendario y el OAuth de cada red social — esta página
// solo crea el workspace y lo embebe en un iframe (Fase 3 del plan, opción
// de menor esfuerzo). Ver PLAN_IMPLEMENTACION_POSTIZ_MAUTIC.md sección 5.
//
// El workspace se aprovisiona solo, sin pedirle un clic al usuario: la info
// (redes conectadas, stats) se ve apenas se entra a la página. Conectar una
// red social puntual (Instagram, LinkedIn, etc.) pasa a ser un paso posterior,
// dentro del propio calendario embebido — no una pantalla previa que bloquea
// todo lo demás.
//
// Reusa componentes/patrones ya probados en el resto del software en vez de
// inventar estilo nuevo: KPICard (Dashboard), grid de tarjetas info (estilo
// MetaAccountPage) y el tono de estado vacío honesto de Configuración.

const PLATFORM_META = {
  instagram: { Icon: RiInstagramLine, color: '#e1306c' },
  facebook:  { Icon: RiFacebookBoxFill, color: '#1877f2' },
  linkedin:  { Icon: RiLinkedinBoxFill, color: '#0a66c2' },
  x:         { Icon: RiTwitterXFill, color: '#e2e8f0' },
  twitter:   { Icon: RiTwitterXFill, color: '#e2e8f0' },
  tiktok:    { Icon: RiTiktokFill, color: '#25f4ee' },
  youtube:   { Icon: RiYoutubeFill, color: '#ff0000' },
}
function platformMeta(name) {
  return PLATFORM_META[String(name ?? '').toLowerCase()] ?? { Icon: RiGlobalLine, color: '#ec4899' }
}

const ANALYTICS_LABELS = {
  posts: 'Posts publicados', reach: 'Alcance', impressions: 'Impresiones',
  engagement: 'Interacciones', followers: 'Seguidores', clicks: 'Clics',
}
const KPI_PALETTE = ['#6366f1', '#f97316', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6']
function humanizeKey(key) {
  return ANALYTICS_LABELS[key.toLowerCase()] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
}
export default function ConectarRedesPage() {
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)
  const [embedUrl, setEmbedUrl] = useState(null)
  const [integrations, setIntegrations] = useState([])
  const [analytics, setAnalytics] = useState(undefined) // undefined = sin pedir, null = sin datos
  const [provisioning, setProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [])

  async function loadStatus() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/postiz')
      if (res.status === 403) {
        setGated(true)
        return
      }
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data?.embedUrl) {
        setEmbedUrl(data.embedUrl)
        setIntegrations(Array.isArray(data.integrations) ? data.integrations : [])
        loadAnalytics()
      } else {
        // Sin workspace todavía: se crea solo, sin pedirle un clic al usuario.
        await provisionWorkspace()
      }
    } catch {
      setProvisionError(true)
    } finally {
      setLoading(false)
    }
  }

  async function loadAnalytics() {
    try {
      const res = await apiFetch('/api/postiz/analytics')
      setAnalytics(res.ok ? await res.json() : null)
    } catch {
      setAnalytics(null)
    }
  }

  async function provisionWorkspace() {
    setProvisioning(true)
    setProvisionError(false)
    try {
      const res = await apiFetch('/api/postiz/connect', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEmbedUrl(data.embedUrl)
      loadAnalytics()
    } catch {
      setProvisionError(true)
    } finally {
      setProvisioning(false)
    }
  }

  // Analytics viene de la API pública de Postiz (forma exacta sin verificar
  // contra un despliegue real, ver postizSync.service.ts) — se muestra
  // genéricamente en vez de asumir nombres de campo concretos.
  const analyticsTiles = analytics && typeof analytics === 'object'
    ? Object.entries(analytics).filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    : []

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
            Redes sociales es una función del Plan Completo. Hablá con tu administrador para activarla.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="dark-scroll" style={{ flex: 1, overflowY: 'auto', background: '#080c14', padding: '26px 32px 40px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #ec4899, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RiShareForwardLine style={{ width: 22, height: 22, color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Redes sociales</h1>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6b7280' }}>Calendario de publicaciones orgánicas (Postiz).</p>
        </div>
      </div>

      {/* Redes conectadas — grid de tarjetas info, mismo patrón que MetaAccountPage.
          Info siempre visible, conectada o no — nunca bloqueada detrás de un botón */}
      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Redes conectadas</p>
      {integrations.length === 0 ? (
        <div style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 12, padding: '16px', textAlign: 'center', marginBottom: 22 }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#4b5563' }}>Ninguna todavía — se conectan desde el calendario de abajo.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
          {integrations.map((i, idx) => {
            const { Icon, color } = platformMeta(i.platform ?? i.name)
            return (
              <div key={i.id ?? idx} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#111827', border: '1px solid #1a2235', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: `linear-gradient(145deg, ${color}55 0%, ${color}25 100%)`, border: `1px solid ${color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon style={{ width: 16, height: 16, color }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name ?? i.platform ?? i.id}</p>
                  <p style={{ margin: 0, fontSize: 10.5, color: '#10b981', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <RiCheckLine style={{ width: 10, height: 10 }} /> Conectada
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Stats de Postiz (GET /api/postiz/analytics), mismo componente KPICard del Dashboard */}
      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Actividad</p>
      {analyticsTiles.length > 0 ? (
        <div className="db-kpi-row" style={{ marginBottom: 22 }}>
          {analyticsTiles.map(([key, value], idx) => (
            <div key={key} style={{ flex: '1 1 160px' }}>
              <KPICard
                Icon={RiBarChartLine}
                iconBg={KPI_PALETTE[idx % KPI_PALETTE.length]}
                color={KPI_PALETTE[idx % KPI_PALETTE.length]}
                label={humanizeKey(key)}
                value={String(value)}
                pct={null}
                data={null}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22, padding: '10px 14px', borderRadius: 10, background: '#111827', border: '1px solid #1a2235', color: '#6b7280', fontSize: 12.5 }}>
          <RiBarChartLine style={{ width: 15, height: 15 }} /> Sin datos de analytics todavía.
        </div>
      )}

      {/* Calendario embebido — donde se conectan las cuentas puntuales de cada red */}
      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Calendario de contenido</p>
      {embedUrl ? (
        <div style={{ flex: 1, background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, overflow: 'hidden', minHeight: 560 }}>
          <iframe title="Postiz" src={embedUrl} style={{ width: '100%', height: '100%', minHeight: 560, border: 'none' }} />
        </div>
      ) : (
        <div style={{
          background: provisionError ? '#f59e0b0d' : '#0d1117',
          border: `1px solid ${provisionError ? '#f59e0b30' : '#1e2433'}`,
          borderRadius: 14, padding: '28px', textAlign: 'center',
        }}>
          {provisionError && <RiAlertLine style={{ width: 24, height: 24, color: '#f59e0b', marginBottom: 10 }} />}
          <p style={{ margin: '0 0 18px', fontSize: 14, color: provisionError ? '#f59e0b' : '#94a3b8' }}>
            {provisioning
              ? 'Preparando tu espacio de redes sociales…'
              : provisionError
                ? 'No se pudo preparar el calendario (Postiz no está disponible en este entorno).'
                : 'El calendario todavía no está listo.'}
          </p>
          {!provisioning && provisionError && (
            <button
              onClick={provisionWorkspace}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 10, border: '1px solid #ec489940',
                background: '#ec489915', color: '#ec4899',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <RiRefreshLine style={{ width: 15, height: 15 }} /> Reintentar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

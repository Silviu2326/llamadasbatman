import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiArrowRightLine, RiCalendarLine, RiPhoneLine } from 'react-icons/ri'
import { apiFetch } from '../../lib/api'
import { DEMO_MODE } from '../../lib/dataMode'
import DataStatusBanner from '../ui/DataStatusBanner'
import { card } from './dashboardData'
import { useI18n } from '../../i18n'

const DEMO_ACTIVITY = [
  { type: 'call', data: { lead: { name: 'Clínica Dental Ruzafa' }, durationSeconds: 263 } },
  { type: 'meeting', data: { title: 'Demo de automatización', lead: { name: 'Estudio Norte' } } },
  { type: 'call', data: { lead: { name: 'Restaurante La Salita' }, durationSeconds: 341 } },
]

export default function AlertasIA() {
  const { locale } = useI18n()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  async function loadActivity() {
    setStatus('loading')
    setError('')
    try {
      const response = await apiFetch('/api/dashboard/activity?limit=4')
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error('No se pudo cargar la actividad reciente.')
      const nextItems = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data)
            ? data.data
            : []
      setItems(nextItems)
      setStatus(nextItems.length ? 'live' : 'empty')
    } catch (loadError) {
      setError(loadError.message || 'No se pudo cargar la actividad reciente.')
      if (DEMO_MODE) {
        setItems(DEMO_ACTIVITY)
        setStatus('demo')
      } else {
        setItems([])
        setStatus('error')
      }
    }
  }

  useEffect(() => { loadActivity() }, [])

  const display = items.map(item => {
    const isCall = item.type === 'call'
    return {
      Icon: isCall ? RiPhoneLine : RiCalendarLine,
      color: isCall ? '#3b82f6' : '#10b981',
      text: isCall
        ? `Llamada con ${item.data?.lead?.name ?? 'Lead'} — ${item.data?.durationSeconds ? `${Math.round(item.data.durationSeconds / 60)} min` : item.data?.status ?? 'sin resultado'}`
        : `Reunión: ${item.data?.title ?? 'sin título'} con ${item.data?.lead?.name ?? 'Lead'}`,
    }
  })

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#ffffff', textShadow: '0 0 20px rgba(255,255,255,0.15)' }}>
        {locale === 'en' ? 'Recent activity' : 'Actividad reciente'}
      </h3>
      <DataStatusBanner
        status={status}
        message={status === 'demo'
          ? 'Ejemplos locales; no representan actividad de tu cuenta.'
          : status === 'empty'
            ? 'Todo listo — la actividad aparecerá aquí cuando empiecen las llamadas.'
            : error}
        onRetry={loadActivity}
        compact
      />
      {status === 'loading'
        ? <p style={{ margin: '8px 0', fontSize: 12, color: '#4b5563' }}>Cargando…</p>
        : display.length === 0
          ? <p style={{ margin: '8px 0', fontSize: 12, color: '#4b5563' }}>{locale === 'en' ? 'No recent activity' : 'Sin actividad reciente'}</p>
          : display.map((activity, index) => (
            <div key={`${activity.text}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: `${activity.color}0d`, border: `1px solid ${activity.color}40`, borderRadius: 10, padding: '10px 11px', boxShadow: `0 0 14px ${activity.color}15` }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${activity.color}25`, border: `1px solid ${activity.color}50`, boxShadow: `0 0 10px ${activity.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <activity.Icon aria-hidden="true" style={{ width: 14, height: 14, color: activity.color }} />
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.55, flex: 1 }}>{activity.text}</p>
            </div>
          ))}
      <div style={{ borderTop: '1px solid #1a2235', paddingTop: 10, marginTop: 'auto' }}>
        <button type="button" onClick={() => navigate('/llamadas')} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: 0, textShadow: '0 0 8px #818cf880' }}>
          <span>{locale === 'en' ? 'View all activity' : 'Ver toda la actividad'}</span>
          <RiArrowRightLine aria-hidden="true" style={{ width: 15, height: 15 }} />
        </button>
      </div>
    </div>
  )
}

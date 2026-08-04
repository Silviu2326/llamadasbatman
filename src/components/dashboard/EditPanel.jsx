import React from 'react'
import { RiAddLine, RiCloseLine, RiLayoutLine, RiRefreshLine } from 'react-icons/ri'
import { WIDGET_META, ALL_WIDGET_IDS } from '../../dashboardConfig'
import { useI18n } from '../../i18n'

export default function EditPanel({ removedWidgets, onAddWidget, onClose, onReset }) {
  const { t } = useI18n()
  const hasRemoved = removedWidgets.length > 0

  return (
    // El ancho lo controla `.fixed-side-panel` (style.css): 300px en escritorio
    // y ancho completo en móvil, donde un panel de 300px no deja sitio al resto.
    <div className="fixed-side-panel" style={{
      position: 'fixed',
      right: 0, top: 0, bottom: 0,
      background: 'var(--bg)',
      borderLeft: '1px solid var(--line)',
      boxShadow: 'var(--shadow-2)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      padding: 'clamp(14px,4vw,22px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(145deg, #4f46e555, #4f46e525)',
            border: '1px solid #4f46e560',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px #4f46e545',
          }}>
            <RiLayoutLine style={{ width: 18, height: 18, color: 'var(--accent-soft)' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>{t('dashboard.editDashboard')}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--dim)' }}>{t('dashboard.visibleWidgets', { visible: ALL_WIDGET_IDS.length - removedWidgets.length, total: ALL_WIDGET_IDS.length })}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 44, height: 44, borderRadius: 8,
            background: 'var(--surface-3)', border: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', cursor: 'pointer',
          }}
        >
          <RiCloseLine style={{ width: 18, height: 18 }} />
        </button>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10,
        padding: '12px 14px', marginBottom: 20,
      }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          {t('dashboard.widgetHelp')}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {hasRemoved ? t('dashboard.removedWidgets') : t('dashboard.availableWidgets')}
        </h4>
        <button
          onClick={onReset}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'transparent', border: 'none',
            color: 'var(--accent-soft)', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', padding: 0,
          }}
        >
          <RiRefreshLine style={{ width: 13, height: 13 }} />
          {t('dashboard.reset')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
        {hasRemoved ? (
          removedWidgets.map(id => {
            const meta = WIDGET_META[id]
            const Icon = meta?.Icon
            return (
              <button
                key={id}
                data-widget-id={id}
                onClick={() => onAddWidget(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'var(--surface)', border: '1px solid var(--line)',
                  borderRadius: 12, padding: '12px 14px',
                  color: 'var(--text-2)', cursor: 'pointer', fontSize: 13,
                  textAlign: 'left', transition: 'all .2s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--surface-3)'
                  e.currentTarget.style.borderColor = '#4f46e560'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--surface)'
                  e.currentTarget.style.borderColor = 'var(--line)'
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'var(--surface-3)', border: '1px solid var(--line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {Icon && <Icon style={{ width: 14, height: 14, color: 'var(--accent-soft)' }} />}
                </div>
                <span style={{ flex: 1 }}>{meta?.label ?? id}</span>
                <RiAddLine style={{ width: 18, height: 18, color: 'var(--success-soft)', flexShrink: 0 }} />
              </button>
            )
          })
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '30px 10px', textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'var(--surface)', border: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RiLayoutLine style={{ width: 24, height: 24, color: 'var(--dim)' }} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--dim)', lineHeight: 1.5 }}>
              {t('dashboard.allVisible')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

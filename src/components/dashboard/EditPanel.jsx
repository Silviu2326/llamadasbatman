import React from 'react'
import { RiAddLine, RiCloseLine, RiLayoutLine, RiRefreshLine } from 'react-icons/ri'
import { WIDGET_META, ALL_WIDGET_IDS } from '../../dashboardConfig'

export default function EditPanel({ removedWidgets, onAddWidget, onClose, onReset }) {
  const hasRemoved = removedWidgets.length > 0

  return (
    <div style={{
      position: 'fixed',
      right: 0, top: 0, bottom: 0,
      width: 300,
      background: '#080c14',
      borderLeft: '1px solid #1e2433',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      padding: '22px',
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
            <RiLayoutLine style={{ width: 18, height: 18, color: '#818cf8' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Editar dashboard</h3>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>{ALL_WIDGET_IDS.length - removedWidgets.length} de {ALL_WIDGET_IDS.length} visibles</p>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 30, height: 30, borderRadius: 8,
            background: '#131b2b', border: '1px solid #1e2433',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94a3b8', cursor: 'pointer',
          }}
        >
          <RiCloseLine style={{ width: 18, height: 18 }} />
        </button>
      </div>

      <div style={{
        background: '#0d1117', border: '1px solid #1e2433', borderRadius: 10,
        padding: '12px 14px', marginBottom: 20,
      }}>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
          Arrastra los widgets para reorganizarlos. Arrastra las esquinas para redimensionarlos. Pulsa la <strong style={{ color:'#f87171' }}>×</strong> de un widget para quitarlo.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {hasRemoved ? 'Widgets eliminados' : 'Widgets disponibles'}
        </h4>
        <button
          onClick={onReset}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'transparent', border: 'none',
            color: '#818cf8', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', padding: 0,
          }}
        >
          <RiRefreshLine style={{ width: 13, height: 13 }} />
          Restablecer
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
                  background: '#0d1117', border: '1px solid #1e2433',
                  borderRadius: 12, padding: '12px 14px',
                  color: '#cbd5e1', cursor: 'pointer', fontSize: 13,
                  textAlign: 'left', transition: 'all .2s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#131b2b'
                  e.currentTarget.style.borderColor = '#4f46e560'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#0d1117'
                  e.currentTarget.style.borderColor = '#1e2433'
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: '#131b2b', border: '1px solid #1e2433',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {Icon && <Icon style={{ width: 14, height: 14, color: '#818cf8' }} />}
                </div>
                <span style={{ flex: 1 }}>{meta?.label ?? id}</span>
                <RiAddLine style={{ width: 18, height: 18, color: '#4ade80', flexShrink: 0 }} />
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
              background: '#0d1117', border: '1px solid #1e2433',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RiLayoutLine style={{ width: 24, height: 24, color: '#4b5563' }} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
              Todos los widgets están visibles. Elimina alguno desde el dashboard para que aparezca aquí.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

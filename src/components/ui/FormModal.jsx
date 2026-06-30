import { useEffect } from 'react'
import { RiCloseLine } from 'react-icons/ri'

const SIZES = {
  sm: 380,
  md: 480,
  lg: 640,
  xl: 800,
}

export default function FormModal({ title, children, onClose, onSubmit, submitText = 'Crear', size = 'md' }) {
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(8,12,20,0.88)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fade-up"
        style={{
          width: SIZES[size] ?? SIZES.md,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 32px)',
          background: '#0d1117',
          border: '1px solid #1e2433',
          borderRadius: 14,
          boxShadow: '0 40px 100px rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #1e2433',
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RiCloseLine style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Body */}
        <form
          id="modal-form"
          onSubmit={e => {
            e.preventDefault()
            if (onSubmit) onSubmit()
            else onClose()
          }}
          className="dark-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {children}
          </div>
        </form>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid #1e2433',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #1e2433',
              borderRadius: 9,
              padding: '9px 18px',
              color: '#94a3b8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="modal-form"
            style={{
              background: 'linear-gradient(90deg,#4f46e5,#7c3aed)',
              border: 'none',
              borderRadius: 9,
              padding: '9px 20px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 0 20px #6366f140',
            }}
          >
            {submitText}
          </button>
        </div>
      </div>
    </div>
  )
}

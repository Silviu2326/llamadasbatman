import { useEffect } from 'react'
import { RiCloseLine } from 'react-icons/ri'
import { useI18n } from '../../i18n'

export default function ActionModal({ title, message, onClose, icon: Icon }) {
  const { locale } = useI18n()
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
        style={{
          width: 400,
          background: '#0d1117',
          border: '1px solid #1e2433',
          borderRadius: 14,
          padding: '24px',
          boxShadow: '0 40px 100px rgba(0,0,0,0.85)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'transparent',
            border: 'none',
            color: '#6b7280',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <RiCloseLine style={{ width: 18, height: 18 }} />
        </button>
        {Icon && (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 0 20px #6366f140',
            }}
          >
            <Icon style={{ width: 28, height: 28, color: '#c4b5fd' }} />
          </div>
        )}
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{title}</h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#94a3b8', lineHeight: 1.5 }}>{message}</p>
        <button
          onClick={onClose}
          style={{
            background: 'linear-gradient(90deg,#4f46e5,#7c3aed)',
            border: 'none',
            borderRadius: 9,
            padding: '10px 24px',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {locale === 'en' ? 'Got it' : 'Entendido'}
        </button>
      </div>
    </div>
  )
}

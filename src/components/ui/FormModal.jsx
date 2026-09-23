import { useEffect, useId, useRef } from 'react'
import { RiCloseLine } from 'react-icons/ri'
import { useI18n } from '../../i18n'

const SIZES = {
  sm: 380,
  md: 480,
  lg: 640,
  xl: 800,
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function FormModal({ title, children, onClose, onSubmit, submitText = 'Crear', submitDisabled = false, size = 'md', footer = null, className = '' }) {
  const { t } = useI18n()
  const modalRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const id = useId().replaceAll(':', '')
  const formId = `modal-form-${id}`
  const titleId = `modal-title-${id}`

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const getFocusableElements = () => Array.from(modalRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) ?? [])
      .filter(element => element instanceof HTMLElement && !element.hasAttribute('hidden'))

    const focusInitialControl = () => {
      const modal = modalRef.current
      if (!modal) return
      const preferredControl = modal.querySelector('[data-autofocus], [autofocus]')
      const firstControl = preferredControl instanceof HTMLElement ? preferredControl : getFocusableElements()[0]
      ;(firstControl ?? modal).focus()
    }

    const frame = requestAnimationFrame(focusInitialControl)
    const handleKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const controls = getFocusableElements()
      if (!controls.length) {
        event.preventDefault()
        modalRef.current?.focus()
        return
      }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKey)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

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
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`fade-up ${className}`.trim()}
        style={{
          width: SIZES[size] ?? SIZES.md,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100dvh - 32px)',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--line)',
            flexShrink: 0,
          }}
        >
          <h3 id={titleId} style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--dim)',
              cursor: 'pointer',
              padding: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RiCloseLine aria-hidden="true" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <form
          id={formId}
          onSubmit={event => {
            event.preventDefault()
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

        {footer ?? <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--line)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 9,
              padding: '9px 18px',
              color: 'var(--muted)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={submitDisabled}
            style={{
              background: 'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))',
              border: 'none',
              borderRadius: 9,
              padding: '9px 20px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: submitDisabled ? 'not-allowed' : 'pointer',
              opacity: submitDisabled ? 0.6 : 1,
              boxShadow: '0 0 20px #6366f140',
            }}
          >
            {submitText === 'Crear' ? t('common.create') : submitText}
          </button>
        </div>}
      </div>
    </div>
  )
}

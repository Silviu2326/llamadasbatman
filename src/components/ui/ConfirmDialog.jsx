import { useEffect, useState } from 'react'

// Diálogo de confirmación propio: sustituye a window.confirm/prompt/alert para
// que las acciones destructivas se vean igual en toda la aplicación.
// Con `promptLabel` pide además un texto obligatorio y lo pasa a onConfirm.
export default function ConfirmDialog({
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  tone = 'danger',
  promptLabel,
  promptPlaceholder = '',
  onConfirm,
  onClose,
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const blocked = busy || (promptLabel ? !value.trim() : false)
  const accent = tone === 'danger'
    ? { background: '#ef444420', border: '1px solid #ef444445', color: 'var(--danger-soft)' }
    : { background: 'linear-gradient(90deg,var(--accent-deep),var(--violet-deep))', border: 'none', color: '#fff' }

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm(promptLabel ? value.trim() : undefined)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="dark-scroll" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: 'clamp(16px,4vw,24px)', width: 'min(400px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxShadow: 'var(--shadow-2)' }}>
        <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: tone === 'danger' ? 'var(--danger-soft)' : 'var(--text-strong)' }}>{title}</p>
        {message && <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{message}</p>}
        {promptLabel && (
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--dim)', marginBottom: 6 }}>{promptLabel}</span>
            <input
              autoFocus
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder={promptPlaceholder}
              onKeyDown={event => { if (event.key === 'Enter' && !blocked) confirm() }}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
            />
          </label>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>{cancelText}</button>
          <button type="button" onClick={confirm} disabled={blocked} style={{ padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.6 : 1, ...accent }}>{busy ? 'Procesando…' : confirmText}</button>
        </div>
      </div>
    </div>
  )
}

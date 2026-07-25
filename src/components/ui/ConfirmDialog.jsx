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
    ? { background: '#ef444420', border: '1px solid #ef444445', color: '#f87171' }
    : { background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', border: 'none', color: '#fff' }

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
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} style={{ background: '#0d1117', border: '1px solid #1e2433', borderRadius: 14, padding: 24, width: 400, boxShadow: '0 40px 80px #0009' }}>
        <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: tone === 'danger' ? '#f87171' : '#f1f5f9' }}>{title}</p>
        {message && <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#94a3b8', lineHeight: 1.5 }}>{message}</p>}
        {promptLabel && (
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{promptLabel}</span>
            <input
              autoFocus
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder={promptPlaceholder}
              onKeyDown={event => { if (event.key === 'Enter' && !blocked) confirm() }}
              style={{ width: '100%', boxSizing: 'border-box', background: '#111827', border: '1px solid #1e2433', borderRadius: 9, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }}
            />
          </label>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #1e2433', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer' }}>{cancelText}</button>
          <button type="button" onClick={confirm} disabled={blocked} style={{ padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.6 : 1, ...accent }}>{busy ? 'Procesando…' : confirmText}</button>
        </div>
      </div>
    </div>
  )
}

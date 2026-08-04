import { useId } from 'react'
import { useI18n } from '../../i18n'

const visuallyHiddenStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export default function FormInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  name,
  hint,
  error,
  'aria-describedby': ariaDescribedBy,
  ...inputProps
}) {
  const { locale } = useI18n()
  const generatedId = useId().replaceAll(':', '')
  const inputId = id ?? `form-input-${generatedId}`
  const hintId = hint ? `${inputId}-hint` : null
  const errorId = error ? `${inputId}-error` : null
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    // minWidth 0: sin esto el ancho mínimo del <input> ensancha la celda de la
    // rejilla y el campo desborda dentro de un FormRow estrecho.
    <div style={{ minWidth: 0 }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--dim)',
            marginBottom: 5,
            fontWeight: 500,
          }}
        >
          {label}
          {required && <span aria-hidden="true" style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
          {required && <span style={visuallyHiddenStyle}> ({locale === 'en' ? 'required' : 'obligatorio'})</span>}
        </label>
      )}
      <input
        {...inputProps}
        id={inputId}
        type={type}
        name={name ?? inputId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? true : inputProps['aria-invalid']}
        aria-describedby={describedBy}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'var(--bg)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--line-control)'}`,
          borderRadius: 8,
          padding: '9px 12px',
          color: 'var(--text)',
          fontSize: 13,
          outline: 'none',
          transition: 'border-color .15s',
          fontFamily: 'inherit',
          ...inputProps.style,
        }}
        onFocus={event => {
          event.target.style.borderColor = 'var(--accent)'
          inputProps.onFocus?.(event)
        }}
        onBlur={event => {
          event.target.style.borderColor = error ? 'var(--danger)' : 'var(--line-control)'
          inputProps.onBlur?.(event)
        }}
      />
      {hint && <small id={hintId} style={{ display: 'block', marginTop: 5, color: 'var(--muted)', fontSize: 11 }}>{hint}</small>}
      {error && <p id={errorId} role="alert" style={{ margin: '5px 0 0', color: 'var(--danger-faint)', fontSize: 11 }}>{error}</p>}
    </div>
  )
}

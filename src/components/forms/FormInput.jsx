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
    <div>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            fontSize: 11,
            color: '#6b7280',
            marginBottom: 5,
            fontWeight: 500,
          }}
        >
          {label}
          {required && <span aria-hidden="true" style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
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
          background: '#080c14',
          border: `1px solid ${error ? '#ef4444' : '#1e2433'}`,
          borderRadius: 8,
          padding: '9px 12px',
          color: '#e2e8f0',
          fontSize: 13,
          outline: 'none',
          transition: 'border-color .15s',
          fontFamily: 'inherit',
          ...inputProps.style,
        }}
        onFocus={event => {
          event.target.style.borderColor = '#8b5cf660'
          inputProps.onFocus?.(event)
        }}
        onBlur={event => {
          event.target.style.borderColor = error ? '#ef4444' : '#1e2433'
          inputProps.onBlur?.(event)
        }}
      />
      {hint && <small id={hintId} style={{ display: 'block', marginTop: 5, color: '#94a3b8', fontSize: 11 }}>{hint}</small>}
      {error && <p id={errorId} role="alert" style={{ margin: '5px 0 0', color: '#fca5a5', fontSize: 11 }}>{error}</p>}
    </div>
  )
}

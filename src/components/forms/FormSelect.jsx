import { HiChevronDown } from 'react-icons/hi'

export default function FormSelect({ label, value, onChange, options = [], required, name }) {
  const normalized = options.map(o => (typeof o === 'string' ? { value: o, label: o } : o))

  return (
    <div>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--dim)',
            marginBottom: 5,
            fontWeight: 500,
          }}
        >
          {label}
          {required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <div style={{ minWidth: 0, position: 'relative' }}>
        <select
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--bg)',
            border: '1px solid var(--line-control)',
            borderRadius: 8,
            padding: '9px 32px 9px 12px',
            color: 'var(--text)',
            fontSize: 13,
            appearance: 'none',
            outline: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.target.style.borderColor = 'var(--line-control)')}
        >
          {normalized.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <HiChevronDown
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--dim)',
            width: 14,
            height: 14,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}

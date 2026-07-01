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
            color: '#6b7280',
            marginBottom: 5,
            fontWeight: 500,
          }}
        >
          {label}
          {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <select
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#080c14',
            border: '1px solid #1e2433',
            borderRadius: 8,
            padding: '9px 32px 9px 12px',
            color: '#e2e8f0',
            fontSize: 13,
            appearance: 'none',
            outline: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onFocus={e => (e.target.style.borderColor = '#8b5cf660')}
          onBlur={e => (e.target.style.borderColor = '#1e2433')}
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
            color: '#6b7280',
            width: 14,
            height: 14,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  )
}

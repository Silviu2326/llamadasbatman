export default function FormInput({ label, value, onChange, placeholder, type = 'text', required, name }) {
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
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: '#080c14',
          border: '1px solid #1e2433',
          borderRadius: 8,
          padding: '9px 12px',
          color: '#e2e8f0',
          fontSize: 13,
          outline: 'none',
          transition: 'border-color .15s',
          fontFamily: 'inherit',
        }}
        onFocus={e => (e.target.style.borderColor = '#8b5cf660')}
        onBlur={e => (e.target.style.borderColor = '#1e2433')}
      />
    </div>
  )
}

export default function FormTextarea({ label, value, onChange, placeholder, rows = 3, required, name }) {
  return (
    <div style={{ minWidth: 0 }}>
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
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={rows}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'var(--bg)',
          border: '1px solid var(--line-control)',
          borderRadius: 8,
          padding: '9px 12px',
          color: 'var(--text)',
          fontSize: 13,
          outline: 'none',
          resize: 'none',
          lineHeight: 1.5,
          transition: 'border-color .15s',
          fontFamily: 'inherit',
          minHeight: 68,
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--line-control)')}
      />
    </div>
  )
}

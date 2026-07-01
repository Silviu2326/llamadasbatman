export default function FormToggle({ label, checked, onChange, name }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      {label && (
        <label
          style={{
            fontSize: 11,
            color: '#6b7280',
            fontWeight: 500,
          }}
        >
          {label}
        </label>
      )}
      <button
        type="button"
        name={name}
        onClick={() => onChange(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: checked ? '#8b5cf6' : '#374151',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background .2s',
          border: 'none',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            transition: 'left .2s',
            boxShadow: '0 1px 4px #0006',
          }}
        />
      </button>
    </div>
  )
}

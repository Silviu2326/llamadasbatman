import { useState, useRef } from 'react'
import { RiFilterLine } from 'react-icons/ri'
import useClickOutside from '../../hooks/useClickOutside'

export default function FilterDropdown({ filters, activeFilters, onChange, badgeCount = 0 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside([ref], () => setOpen(false))

  function toggleFilter(key) {
    const next = activeFilters.includes(key)
      ? activeFilters.filter(f => f !== key)
      : [...activeFilters, key]
    onChange(next)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#0d1117',
          border: '1px solid #1e2433',
          borderRadius: 9,
          padding: '7px 13px',
          color: '#94a3b8',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <RiFilterLine style={{ width: 13, height: 13 }} />
        Filtros
        {badgeCount > 0 && (
          <span
            style={{
              background: '#6366f1',
              color: '#fff',
              borderRadius: 99,
              padding: '0 5px',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {badgeCount}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: '#0d1117',
            border: '1px solid #1e2433',
            borderRadius: 10,
            padding: '8px 6px',
            minWidth: 180,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {filters.map(({ key, label }) => (
            <label
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                color: '#cbd5e1',
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={activeFilters.includes(key)}
                onChange={() => toggleFilter(key)}
                style={{ accentColor: '#6366f1', width: 14, height: 14 }}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useRef } from 'react'
import { RiFilterLine } from 'react-icons/ri'
import useClickOutside from '../../hooks/useClickOutside'
import { useI18n } from '../../i18n'

export default function FilterDropdown({ filters, activeFilters, onChange, badgeCount = 0 }) {
  const { locale } = useI18n()
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
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 9,
          padding: '7px 13px',
          color: 'var(--muted)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <RiFilterLine style={{ width: 13, height: 13 }} />
        {locale === 'en' ? 'Filters' : 'Filtros'}
        {badgeCount > 0 && (
          <span
            style={{
              background: 'var(--accent-deep)',
              color: 'var(--on-accent)',
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
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '8px 6px',
            minWidth: 180,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'min(60vh, 320px)',
            overflowY: 'auto',
            boxShadow: 'var(--shadow-2)',
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
                color: 'var(--text-2)',
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={activeFilters.includes(key)}
                onChange={() => toggleFilter(key)}
                style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

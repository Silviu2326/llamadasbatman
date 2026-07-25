import { useState, useRef } from 'react'
import { RiDownloadLine } from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import useClickOutside from '../../hooks/useClickOutside'
import { downloadCSV } from '../../utils/csvExport'
import { useI18n } from '../../i18n'

export default function ExportDropdown({ data, filename, columns, label = 'Exportar' }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside([ref], () => setOpen(false))

  function handleExport(format) {
    setOpen(false)
    const rows = [columns.map(c => c.header), ...data.map(row => columns.map(c => c.getValue(row)))]
    downloadCSV(filename, rows)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'linear-gradient(90deg,#4f46e5,#7c3aed)',
          border: 'none',
          borderRadius: 9,
          padding: '7px 15px',
          color: 'white',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 0 18px #4f46e544',
        }}
      >
        <RiDownloadLine style={{ width: 13, height: 13 }} />
        {label === 'Exportar' ? t('calls.export') : label} <HiChevronDown style={{ width: 12, height: 12, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
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
            padding: 6,
            minWidth: 140,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {[
            { key: 'csv', label: 'CSV', available: true },
            { key: 'xlsx', label: `Excel — ${t('common.comingSoon')}`, available: false },
            { key: 'pdf', label: `PDF — ${t('common.comingSoon')}`, available: false },
          ].map(o => (
            <button
              key={o.key}
              onClick={() => o.available && handleExport(o.key)}
              disabled={!o.available}
              aria-disabled={!o.available}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                padding: '7px 10px',
                color: o.available ? '#cbd5e1' : '#64748b',
                fontSize: 12,
                textAlign: 'left',
                cursor: o.available ? 'pointer' : 'not-allowed',
                opacity: o.available ? 1 : 0.7,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

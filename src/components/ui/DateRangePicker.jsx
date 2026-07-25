import { useState, useRef } from 'react'
import { RiCalendar2Line } from 'react-icons/ri'
import { HiChevronDown } from 'react-icons/hi'
import useClickOutside from '../../hooks/useClickOutside'
import { formatInputDate, formatDisplayDate, addDays } from '../../utils/dateHelpers'
import { useI18n } from '../../i18n'

const dropdownStyle = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  background: '#0d1117',
  border: '1px solid #1e2433',
  borderRadius: 10,
  padding: 6,
  minWidth: 220,
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const inputStyle = {
  background: '#080c14',
  border: '1px solid #1e2433',
  borderRadius: 6,
  padding: '6px 8px',
  color: '#f1f5f9',
  fontSize: 12,
}

export default function DateRangePicker({ onChange, defaultDays = 6 }) {
  const { t, locale } = useI18n()
  const today = new Date()
  const start = addDays(today, -defaultDays)
  const [startDate, setStartDate] = useState(formatInputDate(start))
  const [endDate, setEndDate] = useState(formatInputDate(today))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside([ref], () => setOpen(false))

  const displayRange = `${formatDisplayDate(new Date(startDate + 'T00:00:00'), locale)} - ${formatDisplayDate(new Date(endDate + 'T00:00:00'), locale)}`

  function updateStart(val) {
    setStartDate(val)
    const newEnd = val > endDate ? val : endDate
    if (val > endDate) setEndDate(newEnd)
    onChange?.({ start: val, end: newEnd })
  }

  function updateEnd(val) {
    setEndDate(val)
    const newStart = val < startDate ? val : startDate
    if (val < startDate) setStartDate(newStart)
    onChange?.({ start: newStart, end: val })
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: '#0d1117',
          border: '1px solid #1e2433',
          borderRadius: 9,
          padding: '7px 13px',
          color: '#94a3b8',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <RiCalendar2Line style={{ width: 13, height: 13 }} />
        {displayRange}
        <HiChevronDown
          style={{
            width: 12,
            height: 12,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </button>
      {open && (
        <div style={{ ...dropdownStyle, right: 'auto', left: 0 }}>
          <label style={{ fontSize: 11, color: '#6b7280', padding: '4px 6px' }}>{t('common.from')}</label>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={e => updateStart(e.target.value)}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <label style={{ fontSize: 11, color: '#6b7280', padding: '4px 6px' }}>{t('common.until')}</label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={e => updateEnd(e.target.value)}
            style={inputStyle}
          />
        </div>
      )}
    </div>
  )
}

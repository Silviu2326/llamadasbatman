import { useState } from 'react'
import '../dashboard.css'
import { useI18n } from '../i18n'

function DataRow({ children, gridTemplate, selected, isLast, onClick, accent, compact }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'grid', gridTemplateColumns: gridTemplate, gap: 0,
        padding: compact ? '8px 16px' : '11px 16px', alignItems: 'center',
        background: selected ? '#0e1422' : hov ? '#0b0f1c' : 'transparent',
        boxShadow: selected
          ? `inset 0 0 0 1px ${accent}, 0 0 20px ${accent}14`
          : isLast ? 'none' : 'inset 0 -1px 0 #111827',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background .15s',
      }}
    >
      {children}
    </div>
  )
}

/**
 * Reusable dark-theme data table.
 *
 * Props
 *   columns      (string | {label, color?})[]   — header labels; color highlights individual headers
 *   gridTemplate string                          — CSS grid-template-columns
 *   rows         any[]                           — data array
 *   rowKey       string                          — field used as React key + selected comparison
 *   selected     any                             — rowKey value of the selected row (or null)
 *   onSelect     (row|null) => void              — row click handler; omit for non-selectable tables
 *   renderRow    (row) => ReactNode[]            — one element per column
 *   accent       string?                         — selection color (default '#4f46e5')
 *   emptyText    string?                         — shown when rows is empty
 *   headerContent ReactNode?                     — overrides default header (for custom headers)
 *   scrollable   bool?                           — wrap rows in overflow-y:auto (default true)
 *   style        CSSProperties?                  — merged into outer container styles
 */
export default function DataTable({
  columns, gridTemplate, rows, rowKey,
  selected, onSelect, renderRow,
  accent = '#4f46e5', emptyText,
  headerContent, scrollable = true, compact = false, style,
}) {
  const { locale } = useI18n()
  const resolvedEmptyText = emptyText ?? (locale === 'en' ? 'No data' : 'Sin datos')
  const normCols = (columns ?? []).map(c => typeof c === 'string' ? { label: c } : c)

  return (
    <div style={{
      background: '#0d1117', border: '1px solid #1e2433', borderRadius: 13,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      ...style,
    }}>
      {/* horizontal scroll wrapper — both header and rows scroll together */}
      <div className="dark-scroll" style={{ overflowX: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* header */}
        {headerContent ?? (
          <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: 0, padding: '10px 16px', borderBottom: '1px solid #1a2235', flexShrink: 0 }}>
            {normCols.map(col => (
              <span key={col.label} style={{ fontSize: 10, color: col.color ?? '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: col.align || 'left' }}>
                {col.label}
              </span>
            ))}
          </div>
        )}

        {/* rows */}
        <div className={scrollable ? 'dark-scroll' : undefined} style={scrollable ? { flex: 1, overflowY: 'auto', minHeight: 0 } : {}}>
          {rows.length === 0
            ? <p style={{ margin: 0, padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#4b5563' }}>{resolvedEmptyText}</p>
            : rows.map((row, i) => {
                const isSelected = selected === row[rowKey]
                return (
                  <DataRow
                    key={row[rowKey]}
                    gridTemplate={gridTemplate}
                    selected={isSelected}
                    isLast={i === rows.length - 1}
                    accent={accent}
                    compact={compact}
                    onClick={onSelect ? () => onSelect(isSelected ? null : row) : undefined}
                  >
                    {renderRow(row)}
                  </DataRow>
                )
              })
          }
        </div>
      </div>
    </div>
  )
}

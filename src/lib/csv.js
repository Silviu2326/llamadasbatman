function escapeCsvValue(value) {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escapeCsvValue(row[h])).join(',')),
  ]
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

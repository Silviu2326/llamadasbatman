export function pad(n) { return n.toString().padStart(2, '0') }

export function formatInputDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDisplayDate(d) {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export function addDays(d, days) {
  const nd = new Date(d)
  nd.setDate(nd.getDate() + days)
  return nd
}

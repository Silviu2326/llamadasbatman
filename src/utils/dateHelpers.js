export function pad(n) { return n.toString().padStart(2, '0') }

export function formatInputDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDisplayDate(d, locale = 'es') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function addDays(d, days) {
  const nd = new Date(d)
  nd.setDate(nd.getDate() + days)
  return nd
}

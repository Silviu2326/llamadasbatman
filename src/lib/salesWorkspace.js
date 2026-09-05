// Read every server page before presenting globally sorted/filtered records.
// A failed or malformed page must never look like a complete, empty collection.
export async function readSalesCollection(fetcher, endpoint, { signal } = {}) {
  const rows = new Map()
  for (let page = 1; page <= 1000; page += 1) {
    const [path, query = ''] = endpoint.split('?')
    const params = new URLSearchParams(query)
    params.set('page', String(page)); params.set('limit', '100')
    const response = await fetcher(`${path}?${params}`, { signal })
    if (!response.ok) throw new Error('No se pudieron cargar todos los registros.')
    const body = await response.json()
    const items = Array.isArray(body) ? body : body?.data ?? body?.items
    if (!Array.isArray(items)) throw new Error('La respuesta no contiene una lista válida.')
    const before = rows.size
    for (const item of items) {
      if (!item?.id) throw new Error('La lista contiene un registro sin identificar.')
      rows.set(item.id, item)
    }
    if (Array.isArray(body) || page >= body.totalPages || (body.total != null && rows.size >= body.total)) {
      if (body.total > rows.size) throw new Error('La lista está incompleta. Vuelve a cargarla.')
      return [...rows.values()]
    }
    if (items.length === 0 || rows.size === before) {
      if (body.total > rows.size) throw new Error('La lista está incompleta. Vuelve a cargarla.')
      return [...rows.values()]
    }
    if (body.totalPages == null && body.total == null && items.length < 100) return [...rows.values()]
  }
  throw new Error('Hay demasiados registros. Reduce la búsqueda para consultar la lista completa.')
}

export function indexNextTasks(tasks) {
  const index = new Map()
  for (const task of tasks) {
    if (['completed', 'cancelled'].includes(task.status)) continue
    for (const key of [task.leadId && `lead:${task.leadId}`, task.opportunityId && `opportunity:${task.opportunityId}`].filter(Boolean)) {
      if (!index.has(key) || dueTime(task.dueAt) < dueTime(index.get(key).dueAt)) index.set(key, task)
    }
  }
  return index
}

export function dueTime(value) {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : Infinity
}

export function localDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

// Stable lanes within each overlapping group, with full width between groups.
export function calendarLanes(events) {
  const positions = new Map()
  for (let day = 0; day < 7; day++) {
    const items = events.filter(e => e.start.getDay() === day).sort((a, b) => a.start - b.start)
    let group = [], ends = [], groupEnd = 0
    const flush = () => { for (const { event, lane } of group) positions.set(`${event.kind}:${event.id}`, { lane, count: ends.length }) }
    for (const event of items) {
      const start = event.start.getTime()
      if (start >= groupEnd) { flush(); group = []; ends = [] }
      let lane = ends.findIndex(end => end <= start)
      if (lane < 0) lane = ends.length
      const end = start + Math.max(15, event.duration) * 60000
      ends[lane] = end; groupEnd = Math.max(groupEnd, end); group.push({ event, lane })
    }
    flush()
  }
  return positions
}

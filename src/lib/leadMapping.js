import { getLocale, localeCode } from '../i18n'

// Convierte un Lead real (Prisma) al shape que usan Leads.jsx y LeadDetailPage.jsx.
// Único lugar donde se deriva score/nivel/actividad a partir del status —
// evita que las dos pantallas se desincronicen si mañana hay un score real.
export const LEAD_BG = ['#4f46e5', '#7c3aed', '#059669', '#0891b2', '#b45309', '#be185d', '#374151', '#047857']
export const BACKEND_STATUS = { new: 'Nuevo', contacted: 'Contactado', qualified: 'Interesado', unqualified: 'Perdido', converted: 'Ganado' }
export const SCORE_BY_STATUS = { new: 40, contacted: 55, qualified: 75, unqualified: 20, converted: 90 }
export const LEVEL_BY_STATUS = { new: 'Medio', contacted: 'Medio', qualified: 'Alto', unqualified: 'Bajo', converted: 'Muy alto' }
export const ACT_BY_STATUS = { new: 'Lead creado', contacted: 'Contactado', qualified: 'Calificado', unqualified: 'Descartado', converted: 'Convertido' }

export function mapLead(l, i = 0) {
  const score = SCORE_BY_STATUS[l.status] ?? 50
  const sl = LEVEL_BY_STATUS[l.status] ?? 'Medio'
  const audit = l.customFields?.digitalAudit ?? null
  return {
    id: l.id,
    initials: (l.name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(),
    bg: LEAD_BG[i % LEAD_BG.length],
    name: l.name ?? '—',
    role: l.customFields?.role ?? '',
    company: l.company ?? '—',
    ci: (l.company ?? '?').slice(0, 2).toUpperCase(),
    cb: '#1d4ed8',
    status: BACKEND_STATUS[l.status] ?? 'Nuevo',
    score, sl,
    act: {
      type: l.status === 'contacted' || l.status === 'qualified' ? 'phone' : l.status === 'converted' ? 'calendar' : 'upload',
      date: l.updatedAt ? new Date(l.updatedAt).toLocaleDateString(localeCode(getLocale()), { month: 'short', day: 'numeric' }) : '—',
      action: ACT_BY_STATUS[l.status] ?? 'Actualizado',
    },
    value: '—',
    agent: { i: '—', bg: '#374151' },
    closePct: score,
    closeLevel: sl,
    potValue: '—',
    source: l.source ?? '—',
    painPoints: audit?.opportunities?.map(o => o.title) ?? [],
    tags: Array.isArray(l.tags) ? l.tags : [],
    phone: l.phone ?? '',
    email: l.email ?? '',
    website: l.customFields?.website ?? null,
    city: l.customFields?.city ?? '',
    mapsUri: l.customFields?.mapsUri ?? null,
    createdAt: l.createdAt ?? null,
    customFields: l.customFields ?? null,
    audit,
    auditFlags: audit ? {
      noWebsite: !audit.webAlive && !audit.webReachable,
      noBooking: audit.tech ? !audit.tech.booking : false,
      noAnalytics: audit.seo ? !audit.seo.hasAnalytics : false,
      fewReviews: (l.customFields?.userRatingCount ?? audit.gbpReviews ?? 0) < 10,
    } : null,
  }
}

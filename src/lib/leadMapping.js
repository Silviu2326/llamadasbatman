import { getLocale, localeCode } from '../i18n'

// Convierte un Lead real (Prisma) al shape que usan Leads.jsx y LeadDetailPage.jsx.
// Único lugar donde se deriva score/nivel/actividad a partir del status —
export const LEAD_BG = ['var(--accent-deep)', 'var(--violet-deep)', 'var(--success-deep)', 'var(--cyan-deep)', 'var(--warn-deep)', 'var(--pink)', 'var(--line-2)', 'var(--success-deep)']
export const BACKEND_STATUS = { new: 'Nuevo', contacted: 'Contactado', qualified: 'Interesado', unqualified: 'Perdido', converted: 'Ganado' }
export const LEVEL_BY_STATUS = { new: 'Medio', contacted: 'Medio', qualified: 'Alto', unqualified: 'Bajo', converted: 'Muy alto' }
export const ACT_BY_STATUS = { new: 'Lead creado', contacted: 'Contactado', qualified: 'Calificado', unqualified: 'Descartado', converted: 'Convertido' }

export function mapLead(l, i = 0) {
  // El score solo existe si viene del servidor (auditoría digital); no se
  // deriva del estado para no mostrar una puntuación que nadie ha calculado.
  const score = l.score ?? l.customFields?.digitalAudit?.leadOpportunityScore ?? null
  const sl = score == null ? null : score >= 82 ? 'Muy alto' : score >= 65 ? 'Alto' : score >= 40 ? 'Medio' : 'Bajo'
  const audit = l.customFields?.digitalAudit ?? null
  return {
    id: l.id,
    initials: (l.name ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(),
    bg: LEAD_BG[i % LEAD_BG.length],
    name: l.name ?? '—',
    role: l.customFields?.role ?? '',
    company: l.company ?? '—',
    ci: (l.company ?? '?').slice(0, 2).toUpperCase(),
    cb: 'var(--info-deep)',
    status: BACKEND_STATUS[l.status] ?? 'Nuevo',
    score, sl,
    act: {
      type: l.status === 'contacted' || l.status === 'qualified' ? 'phone' : l.status === 'converted' ? 'calendar' : 'upload',
      date: l.updatedAt ? new Date(l.updatedAt).toLocaleDateString(localeCode(getLocale()), { month: 'short', day: 'numeric' }) : '—',
      action: ACT_BY_STATUS[l.status] ?? 'Actualizado',
    },
    value: '—',
    agent: { i: '—', bg: 'var(--line-2)' },
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

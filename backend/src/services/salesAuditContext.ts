function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

/** Bounded context only: importing an audit never authorizes contacting its owner. */
export function salesAuditContext(customFields: unknown, latestAudit?: unknown) {
  const fields = record(customFields)
  const audit = record(latestAudit ?? fields.salesAudit ?? fields.digitalAudit)
  const summary = typeof audit.summary === 'string' ? audit.summary.slice(0, 2000) : ''
  const candidates = Array.isArray(audit.findings) ? audit.findings : Array.isArray(audit.opportunities) ? audit.opportunities : []
  const findings = candidates.filter(item => item && typeof item === 'object').slice(0, 3).map(item => ({
    title: String(item.title ?? item.description ?? '').slice(0, 300),
    evidence: typeof item.evidence === 'string' ? item.evidence.slice(0, 700) : '',
    status: item.status === 'fail' && typeof item.evidence === 'string' && item.evidence.trim() ? 'verified' : 'needs_review',
  })).filter(item => item.title)
  return { available: Boolean(summary || findings.length), summary, findings, auditedAt: typeof audit.auditedAt === 'string' ? audit.auditedAt : null }
}

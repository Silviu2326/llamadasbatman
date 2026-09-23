import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'

export type NewsletterDraftContent = Record<string, string>
type NewsletterDraftRow = { id: string; orgId: string; name: string; content: Prisma.JsonValue; createdAt: Date; updatedAt: Date }

function toPublicDraft(draft: NewsletterDraftRow) {
  return { id: draft.id, orgId: draft.orgId, name: draft.name, content: draft.content as NewsletterDraftContent, createdAt: draft.createdAt, updatedAt: draft.updatedAt }
}

export async function listNewsletterDrafts(orgId: string) {
  const drafts = await prisma.emailNewsletterDraft.findMany({ where: { orgId }, orderBy: { updatedAt: 'desc' } })
  return drafts.map(toPublicDraft)
}

export async function createNewsletterDraft(orgId: string, input: { name: string; content: NewsletterDraftContent }) {
  const draft = await prisma.emailNewsletterDraft.create({ data: { orgId, name: input.name, content: input.content as Prisma.InputJsonObject } })
  return toPublicDraft(draft)
}

export async function updateNewsletterDraft(orgId: string, id: string, input: { name: string; content: NewsletterDraftContent }) {
  const result = await prisma.emailNewsletterDraft.updateMany({ where: { id, orgId }, data: { name: input.name, content: input.content as Prisma.InputJsonObject } })
  if (!result.count) return null
  const draft = await prisma.emailNewsletterDraft.findFirst({ where: { id, orgId } })
  return draft ? toPublicDraft(draft) : null
}

export async function deleteNewsletterDraft(orgId: string, id: string) {
  const result = await prisma.emailNewsletterDraft.deleteMany({ where: { id, orgId } })
  return result.count > 0
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

function safeHttpUrl(value: string) { return /^https?:\/\//i.test(value) ? value : '' }

export function renderNewsletterDraftHtml(content: NewsletterDraftContent) {
  const accent = /^#[\da-f]{6}$/i.test(content.accent) ? content.accent : '#4f46e5'
  const logoUrl = safeHttpUrl(content.logoUrl || '')
  const ctaUrl = safeHttpUrl(content.ctaUrl || '')
  const logo = logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(content.brand || '')}" width="132" style="display:block;max-width:132px;height:auto;margin:0 auto 18px">` : ''
  const paragraphs = String(content.body || '').split(/\n{2,}/).map(part => `<p style="margin:0 0 16px;line-height:1.7;color:#344054">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('')
  const button = ctaUrl ? `<tr><td align="center" style="padding:8px 32px 28px"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 22px;border-radius:7px;background:${accent};color:#fff;text-decoration:none;font-weight:700">${escapeHtml(content.cta || 'Descubrir más')}</a></td></tr>` : ''
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject || '')}</title><meta name="description" content="${escapeHtml(content.preheader || '')}"></head><body style="margin:0;padding:24px 12px;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#172033"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader || '')}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e4e8f0;border-radius:12px;overflow:hidden"><tr><td style="height:6px;background:${accent}"></td></tr><tr><td align="center" style="padding:32px 32px 12px">${logo}<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accent}">${escapeHtml(content.brand || '')}</div></td></tr><tr><td style="padding:12px 32px 4px"><h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;color:#172033">${escapeHtml(content.heading || '')}</h1><p style="margin:0 0 16px;line-height:1.7;color:#344054">${escapeHtml(content.intro || '')}</p>${paragraphs}</td></tr>${button}<tr><td style="padding:20px 32px;border-top:1px solid #e4e8f0;text-align:center;font-size:12px;line-height:1.6;color:#667085"><p style="margin:0 0 8px">${escapeHtml(content.footer || '')}</p><a href="{{UNSUBSCRIBE_URL}}" style="color:#667085;text-decoration:underline">Darse de baja</a></td></tr></table></body></html>`
}

export async function getNewsletterDraftForCampaign(orgId: string, id: string) {
  const draft = await prisma.emailNewsletterDraft.findFirst({ where: { id, orgId } })
  if (!draft) return null
  const content = draft.content as NewsletterDraftContent
  return { id: draft.id, name: draft.name, content, subject: content.subject?.trim() || draft.name, html: renderNewsletterDraftHtml(content) }
}

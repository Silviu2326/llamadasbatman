import { prisma } from '../lib/prisma'

/**
 * Integración con Postiz (redes sociales, instancia única self-hosted — ver
 * PLAN_IMPLEMENTACION_POSTIZ_MAUTIC.md sección 5). Postiz resuelve OAuth por
 * red social y el calendario de publicaciones — este servicio solo hace de
 * pegamento: crea el workspace de la organización, entrega la URL para
 * embeber su UI (Fase 3 punto 4: iframe, no un calendario propio) y reusa el
 * copy/imagen que ya genera assetGenerator.service.ts para crear un borrador
 * de post.
 *
 * Los paths exactos de la API pública de Postiz (`/public/v1/...`) deben
 * confirmarse contra la documentación de la versión desplegada al momento de
 * activar esto — se documentan aquí con la forma esperada de una API REST
 * de este tipo, no verificados contra un despliegue real todavía.
 */

function isConfigured(): boolean {
  return Boolean(process.env.POSTIZ_BASE_URL && process.env.POSTIZ_API_KEY)
}

async function postizFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!isConfigured()) return null
  try {
    return await fetch(`${process.env.POSTIZ_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${process.env.POSTIZ_API_KEY}`, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.warn(`[PostizSync] request to ${path} failed:`, (err as Error).message)
    return null
  }
}

/** Crea el workspace de Postiz para la org si todavía no tiene uno. */
export async function ensureWorkspace(orgId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { postizWorkspaceId: true, name: true } })
  if (org?.postizWorkspaceId) return org.postizWorkspaceId

  const res = await postizFetch('/public/v1/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name: org?.name ?? orgId }),
  })
  if (!res?.ok) return null
  const data = (await res.json()) as { id: string }
  await prisma.organization.update({ where: { id: orgId }, data: { postizWorkspaceId: data.id } })
  return data.id
}

/** URL para embeber el calendario de Postiz de esta org (iframe, Fase 3 punto 4). */
export function buildEmbedUrl(workspaceId: string): string {
  return `${process.env.POSTIZ_BASE_URL}/p/${workspaceId}`
}

export async function listIntegrations(workspaceId: string) {
  const res = await postizFetch(`/public/v1/workspaces/${workspaceId}/integrations`)
  if (!res?.ok) return []
  return res.json()
}

export async function listPosts(workspaceId: string) {
  const res = await postizFetch(`/public/v1/workspaces/${workspaceId}/posts`)
  if (!res?.ok) return []
  return res.json()
}

export async function getAnalytics(workspaceId: string) {
  const res = await postizFetch(`/public/v1/workspaces/${workspaceId}/analytics`)
  if (!res?.ok) return null
  return res.json()
}

/**
 * "Programar también como post orgánico" del wizard de campaña (Fase 3 punto
 * 3): reusa el mismo copy/imagen que ya se generó para el anuncio, no genera
 * contenido nuevo.
 */
export async function createDraftPost(
  workspaceId: string,
  content: { text: string; imageUrl?: string; platforms: string[] }
) {
  const res = await postizFetch(`/public/v1/workspaces/${workspaceId}/posts`, {
    method: 'POST',
    body: JSON.stringify({ content: content.text, mediaUrls: content.imageUrl ? [content.imageUrl] : [], integrations: content.platforms, state: 'draft' }),
  })
  if (!res?.ok) return null
  return res.json()
}

import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

/**
 * Libro de marca mínimo — lo que necesitan los carruseles con plantilla
 * (idea 7, `roadmap.md` fase 2): dos colores, un color de texto y un logo.
 *
 * Vive en `Organization.settings.brand`, junto al perfil de voz y a las
 * preferencias aprendidas de los rechazos, porque las tres describen lo mismo:
 * cómo se presenta este negocio. Una tabla aparte para cuatro campos que solo
 * se leen a la vez que la organización habría sido una tabla aparte para nada.
 *
 * Los valores por defecto son neutros a propósito y se marcan como tales
 * (`isDefault`): una plantilla con los colores de otro sería peor que una
 * plantilla sobria, y la interfaz tiene que poder decir "estos no son tus
 * colores todavía".
 */

export interface BrandKit {
  primary: string
  secondary: string
  text: string
  logoUrl: string | null
  fontFamily: string
}

export const DEFAULT_BRAND: BrandKit = {
  primary: '#101828',
  secondary: '#F2F4F7',
  text: '#FFFFFF',
  logoUrl: null,
  fontFamily: 'Inter, Helvetica, Arial, sans-serif',
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const brandKitSchema = z.object({
  primary: z.string().trim().regex(HEX, 'El color debe ser un hexadecimal (#123456)').optional(),
  secondary: z.string().trim().regex(HEX, 'El color debe ser un hexadecimal (#123456)').optional(),
  text: z.string().trim().regex(HEX, 'El color debe ser un hexadecimal (#123456)').optional(),
  // El logo acaba dentro de un SVG que el navegador rasteriza: tiene que ser
  // descargable de verdad, no solo parecer una URL.
  logoUrl: z.union([
    z.string().trim().max(2_048).url().refine(value => /^https?:\/\//i.test(value), 'El logo debe ser una URL http(s)'),
    z.null(),
  ]).optional(),
  fontFamily: z.string().trim().max(120).optional(),
}).strict()

export async function getBrandKit(orgId: string): Promise<BrandKit & { isDefault: boolean }> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } })
  const stored = ((org?.settings ?? {}) as { brand?: Partial<BrandKit> }).brand
  if (!stored) return { ...DEFAULT_BRAND, isDefault: true }
  return {
    primary: stored.primary ?? DEFAULT_BRAND.primary,
    secondary: stored.secondary ?? DEFAULT_BRAND.secondary,
    text: stored.text ?? DEFAULT_BRAND.text,
    logoUrl: stored.logoUrl ?? null,
    fontFamily: stored.fontFamily ?? DEFAULT_BRAND.fontFamily,
    isDefault: false,
  }
}

export async function saveBrandKit(orgId: string, input: z.infer<typeof brandKitSchema>) {
  const current = await getBrandKit(orgId)
  const next: BrandKit = {
    primary: input.primary ?? current.primary,
    secondary: input.secondary ?? current.secondary,
    text: input.text ?? current.text,
    logoUrl: input.logoUrl === undefined ? current.logoUrl : input.logoUrl,
    fontFamily: input.fontFamily ?? current.fontFamily,
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } })
  const settings = (org?.settings ?? {}) as Record<string, unknown>
  await prisma.organization.update({
    where: { id: orgId },
    data: { settings: { ...settings, brand: next } as unknown as Prisma.InputJsonObject },
  })
  return { ...next, isDefault: false }
}

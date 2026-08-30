/**
 * Descubrimiento y verificación de correos de prospectos.
 *
 * Dos piezas del enriquecimiento (ver PROCESO_AUTOMATICO_LEADS.md, etapa 4):
 *
 * 1. `verifyEmail` — comprueba que el buzón existe antes de enviarle nada. Sin
 *    esto el rebote sube al 8-10 % y los buzones de envío se queman en dos
 *    semanas; verificando se queda por debajo del 2 %.
 * 2. `discoverOwnerEmail` — deriva el correo del dueño a partir de su nombre
 *    (que los registros mercantiles publican gratis) y del dominio. Escribir a
 *    una persona con nombre duplica la tasa de respuesta frente a `info@`.
 *
 * Proveedor de verificación: MillionVerifier (~0,0004 $/comprobación). La API
 * es un GET plano, así que no hace falta SDK.
 */

import { prisma } from '../lib/prisma'

const VERIFY_ENDPOINT = 'https://api.millionverifier.com/api/v3/'
const VERIFY_TIMEOUT_MS = 15_000

export type EmailVerdict =
  /** El buzón existe. */
  | 'valid'
  /** No existe, es desechable o el dominio no acepta correo. */
  | 'invalid'
  /** El servidor no se moja (catch-all) o la comprobación falló. */
  | 'unknown'
  /** No hay `EMAIL_VERIFIER_API_KEY`: no se ha comprobado nada. */
  | 'skipped'

let missingKeyWarned = false

function verifierKey(): string | null {
  const key = process.env.EMAIL_VERIFIER_API_KEY?.trim()
  if (key) return key
  if (!missingKeyWarned) {
    missingKeyWarned = true
    console.warn(
      '[EmailDiscovery] EMAIL_VERIFIER_API_KEY sin configurar: los correos salen sin verificar y el rebote puede quemar los buzones.'
    )
  }
  return null
}

/**
 * Comprueba un buzón contra el verificador externo.
 *
 * Nunca lanza: un fallo de red devuelve 'unknown' para que quien llame decida.
 * La política de envío está en `isSafeToSend`.
 */
export async function verifyEmail(email: string): Promise<EmailVerdict> {
  const address = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return 'invalid'

  const key = verifierKey()
  if (!key) return 'skipped'

  const url = `${VERIFY_ENDPOINT}?api=${encodeURIComponent(key)}&email=${encodeURIComponent(address)}&timeout=10`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS) })
    if (!res.ok) {
      console.warn(`[EmailDiscovery] verificador respondió ${res.status} para ${address}`)
      return 'unknown'
    }
    const body = (await res.json()) as { result?: string }
    switch (body.result) {
      case 'ok':
        return 'valid'
      case 'invalid':
      case 'disposable':
        return 'invalid'
      default:
        // catch_all, unknown, error…
        return 'unknown'
    }
  } catch (error) {
    console.warn(`[EmailDiscovery] verificación fallida para ${address}:`, (error as Error).message)
    return 'unknown'
  }
}

/**
 * Política de envío. Con verificador configurado solo se envía a buzones
 * confirmados; sin él, se envía igual (comportamiento previo) porque bloquear
 * todos los envíos por una clave que falta rompería la operación entera.
 */
export function isSafeToSend(verdict: EmailVerdict): boolean {
  return verdict === 'valid' || verdict === 'skipped'
}

/**
 * Veredicto del buzón de un lead, cacheado en `Lead.customFields`.
 *
 * Una secuencia en frío son cuatro correos al mismo buzón: verificarlo en cada
 * envío cuadruplica el coste sin aportar nada, porque un buzón no deja de
 * existir entre el martes y el jueves. La caché se invalida sola cuando cambia
 * la dirección, que es el único caso en que el veredicto anterior ya no aplica.
 *
 * Los veredictos provisionales ('unknown', por un fallo de red) no se cachean:
 * la siguiente tentativa vuelve a preguntar.
 */
export async function verdictForLead(orgId: string, leadId: string, email: string): Promise<EmailVerdict> {
  const address = email.trim().toLowerCase()
  const lead = await prisma.lead.findFirst({ where: { id: leadId, orgId }, select: { customFields: true } })
  const fields = (lead?.customFields ?? {}) as Record<string, unknown>
  if (fields.verifiedAddress === address && typeof fields.emailVerdict === 'string') {
    return fields.emailVerdict as EmailVerdict
  }

  const verdict = await verifyEmail(address)
  if (verdict === 'unknown') return verdict

  await prisma.lead.update({
    where: { id: leadId },
    data: { customFields: { ...fields, verifiedAddress: address, emailVerdict: verdict } },
  }).catch((error) => console.warn(`[EmailDiscovery] no se pudo cachear el veredicto de ${leadId}:`, (error as Error).message))
  return verdict
}

/**
 * Ruido que los registros mercantiles meten en el campo del titular: tratamientos,
 * sufijos generacionales y, sobre todo, formas societarias. Una buena parte de las
 * filas trae la razón social en vez de una persona ("ACME ROOFING LLC") y no hay
 * ningún correo personal que deducir de ahí.
 */
const NAME_NOISE_RE =
  /\b(jr|sr|ii|iii|iv|mr|mrs|ms|dr|llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|plc|lp|llp|pllc|pc|group|holdings|enterprises|trust|partners|associates)\b/g

/**
 * Parte un nombre de persona en nombre y apellido.
 *
 * Los registros mercantiles americanos lo publican de tres formas:
 * "JOHN SMITH", "SMITH, JOHN" y "JOHN A. SMITH". Con la coma, el apellido va
 * delante. Sin ella, el último token es el apellido y el primero el nombre;
 * las iniciales de en medio se ignoran.
 *
 * ponytail: heurística, no un analizador de nombres. Con entradas mixtas del
 * tipo "John Smith Roofing LLC" acertará el nombre y fallará el apellido. No
 * pasa nada: cada candidato se verifica antes de usarse, así que un fallo
 * cuesta 0,002 $ y no llega a enviarse ningún correo. Lo que sí evita esta
 * función es gastar esas verificaciones en razones sociales puras.
 */
export function splitOwnerName(raw: string): { first: string; last: string } | null {
  const clean = raw
    .toLowerCase()
    .replace(/[^a-záéíóúñü,\s'-]/g, ' ')
    .replace(NAME_NOISE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return null

  if (clean.includes(',')) {
    const [lastPart, firstPart] = clean.split(',', 2)
    const last = lastPart.trim().split(' ')[0]
    const first = (firstPart ?? '').trim().split(' ')[0]
    return first && last ? { first, last } : null
  }

  const parts = clean.split(' ').filter((p) => p.length > 1)
  if (parts.length < 2) return null
  return { first: parts[0], last: parts[parts.length - 1] }
}

/**
 * Los cinco patrones que cubren casi todo el correo de empresa pequeña
 * americana, ordenados de más a menos frecuente.
 */
export function emailCandidates(ownerName: string, domain: string): string[] {
  const name = splitOwnerName(ownerName)
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
  if (!name || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return []

  // Cuando el "titular" es en realidad la razón social, sus palabras están
  // dentro del propio dominio ("ACME ROOFING LLC" → acmeroofing.com). Ahí no
  // hay ninguna persona que deducir y las cinco verificaciones se tirarían.
  const { first, last } = name
  const hostWords = host.replace(/[^a-z]/g, '')
  if (hostWords.includes(first) && hostWords.includes(last)) return []

  return [
    `${first}@${host}`,
    `${first}${last}@${host}`,
    `${first}.${last}@${host}`,
    `${first[0]}${last}@${host}`,
    `${last}@${host}`,
  ]
}

/**
 * Prueba los candidatos en orden y devuelve el primero que el verificador
 * confirma. Para en cuanto acierta, así que el coste medio es de dos o tres
 * comprobaciones, no de cinco.
 *
 * Devuelve null sin verificador configurado: adivinar sin comprobar es
 * precisamente lo que quema los buzones.
 */
export async function discoverOwnerEmail(ownerName: string, domain: string): Promise<string | null> {
  if (!verifierKey()) return null
  for (const candidate of emailCandidates(ownerName, domain)) {
    if ((await verifyEmail(candidate)) === 'valid') return candidate
  }
  return null
}

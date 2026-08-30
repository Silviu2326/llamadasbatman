import { PrismaClient } from '@prisma/client'

const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.VENDRAVA_TEST_MODE === '1'
const databaseUrl = (isTestRuntime ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL)?.trim()

if (!databaseUrl) {
  throw new Error(isTestRuntime
    ? 'TEST_DATABASE_URL es obligatoria antes de inicializar Prisma en modo test.'
    : 'DATABASE_URL es obligatoria antes de inicializar Prisma.')
}

/**
 * Tolerancia al arranque en frío del Postgres serverless.
 *
 * Neon suspende el cómputo tras unos minutos sin tráfico. La primera consulta
 * después de esa pausa tiene que esperar a que despierte, y el `connect_timeout`
 * por defecto de Prisma —5 s— se queda corto: la conexión revienta con P1001,
 * `middlewares/authenticate.ts` lo traduce a 503 DATABASE_UNAVAILABLE y la
 * pantalla que estuvieras abriendo anuncia «el servicio de datos no está
 * disponible, comprueba el backend» cuando el backend está perfectamente vivo.
 *
 * Se amplía el margen por la cadena de conexión, que es donde Prisma lee estos
 * ajustes, sin pisar nunca lo que ya venga puesto en la URL y sin tocar las
 * credenciales: se reescribe solo la query, no el userinfo.
 */
export function withColdStartTolerance(url: string): string {
  const separator = url.indexOf('?')
  // En una URL válida el primer '?' abre la query: un '?' dentro de la
  // contraseña tiene que venir percent-encoded, así que cortar aquí es seguro.
  const base = separator === -1 ? url : url.slice(0, separator)
  const params = new URLSearchParams(separator === -1 ? '' : url.slice(separator + 1))
  if (!params.has('connect_timeout')) params.set('connect_timeout', '20')
  if (!params.has('pool_timeout')) params.set('pool_timeout', '20')
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

// La URL se fija en la construcción del cliente. En tests el runner establece
// TEST_DATABASE_URL y NODE_ENV antes de importar cualquier módulo de dominio;
// producción continúa usando exclusivamente DATABASE_URL.
export const prisma = new PrismaClient({
  datasources: { db: { url: withColdStartTolerance(databaseUrl) } },
})

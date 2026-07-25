import { PrismaClient } from '@prisma/client'

const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.VENDRAVA_TEST_MODE === '1'
const databaseUrl = (isTestRuntime ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL)?.trim()

if (!databaseUrl) {
  throw new Error(isTestRuntime
    ? 'TEST_DATABASE_URL es obligatoria antes de inicializar Prisma en modo test.'
    : 'DATABASE_URL es obligatoria antes de inicializar Prisma.')
}

// La URL se fija en la construcción del cliente. En tests el runner establece
// TEST_DATABASE_URL y NODE_ENV antes de importar cualquier módulo de dominio;
// producción continúa usando exclusivamente DATABASE_URL.
export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
})

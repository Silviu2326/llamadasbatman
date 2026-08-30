import { FastifyInstance } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requirePermission } from '../access-control'
import * as ctrl from '../controllers/wallet.controller'

/**
 * Wallet de créditos gestionados (09-MODELO-COMERCIAL §2).
 * El integrador monta el prefijo /api/wallet en index.ts.
 *
 * Permisos (catálogo src/access-control/catalog.ts):
 * - GET /      → `costs.read` (org): el panel de saldo/consumo es exactamente
 *   la vista de costes; `dashboard.read` lo tiene hasta `guest` y expondría
 *   información financiera a roles que no deben verla.
 * - POST /topup → `costs.approve` (org): recargar compromete dinero real de
 *   la organización — misma separación de funciones que aprobar gasto
 *   (owner y finance_controller; admin deliberadamente no puede, igual que
 *   no puede aprobar experimentos de pago).
 */
export async function walletRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get(
    '/',
    { preHandler: [requirePermission('costs.read', { scope: 'org' })] },
    ctrl.getWallet as any,
  )

  app.post(
    '/topup',
    { preHandler: [requirePermission('costs.approve', { scope: 'org' })] },
    ctrl.createTopup as any,
  )
}

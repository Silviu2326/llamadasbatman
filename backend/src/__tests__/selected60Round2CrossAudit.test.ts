process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import '../providers'
import { PERMISSIONS } from '../access-control/catalog'
import { REVENUE_AGENCY_INPUT_FIXTURES, REVENUE_AGENCY_MICROAPP_IDS } from '../microapps/apps/revenueAgencyPack.catalog'
import { INTELLIGENCE_GROWTH_EXAMPLES, INTELLIGENCE_GROWTH_ID_BY_NUMBER } from '../microapps/apps/intelligenceGrowthPack21to40'
import { WAVE2_CONTENT_MEDIA_FIXTURES, WAVE2_CONTENT_MEDIA_IDS } from '../microapps/apps/wave2ContentMediaPack'
import { WAVE2_DATA_AIOPS_FIXTURES, WAVE2_DATA_AIOPS_IDS } from '../microapps/apps/wave2DataAiOpsPack'
import { validateMicroappEstimate } from '../microapps/quality'
import { getMicroapp } from '../microapps/registry'
import { bindingsFor } from '../providers/registry'

const IDS = Object.values({ ...REVENUE_AGENCY_MICROAPP_IDS, ...INTELLIGENCE_GROWTH_ID_BY_NUMBER, ...WAVE2_CONTENT_MEDIA_IDS, ...WAVE2_DATA_AIOPS_IDS })
const FIXTURES: Record<string, unknown> = {
  ...REVENUE_AGENCY_INPUT_FIXTURES,
  ...Object.fromEntries(Object.entries(INTELLIGENCE_GROWTH_EXAMPLES).map(([id, example]) => [id, example.input])),
  ...WAVE2_CONTENT_MEDIA_FIXTURES,
  ...WAVE2_DATA_AIOPS_FIXTURES,
}
const R2_IDS = new Set([
  ...Object.values(INTELLIGENCE_GROWTH_ID_BY_NUMBER),
  'prompt-model-lab', 'roi-calculator',
  'interface-demo-video', 'subtitle-inspector', 'delivery-package-builder', 'audiovisual-rights-inspector',
  'csv-excel-doctor', 'schema-mapper', 'knowledge-base-builder', 'workflow-synthetic-evaluator', 'prompt-drift-detector', 'byok-managed-comparator',
])

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  return schema
}

test('auditoría cruzada R2 valida los 60 manifests contra el registro completo de proveedores', async () => {
  assert.equal(IDS.length, 60)
  assert.equal(new Set(IDS).size, 60)
  const permissions = new Set<string>(PERMISSIONS)
  for (const id of IDS) {
    const app = getMicroapp(id)
    assert.ok(app, `${id}: no registrada`)
    const [major, minor] = app.version.split('.').map(Number)
    assert.ok(major > 1 || (major === 1 && minor >= 1), `${id}: versión anterior a la primera ronda`)
    if (R2_IDS.has(id)) assert.ok(major > 1 || minor >= 2, `${id}: perdió el incremento contractual de R2`)
    assert.equal(app.effects, 'local', `${id}: efecto externo sin aprobación declarada`)
    assert.ok(app.freshnessDays && app.freshnessDays > 0, `${id}: freshness inválida`)
    assert.ok(app.followUps.length, `${id}: sin ruta siguiente`)
    assert.equal(new Set(app.dataAccess).size, app.dataAccess.length, `${id}: permisos duplicados`)
    assert.ok(app.dataAccess.every(permission => permissions.has(permission)), `${id}: permiso desconocido`)
    const input = unwrap(app.inputSchema)
    assert.ok(input instanceof z.ZodObject, `${id}: input no es objeto`)
    assert.deepEqual(new Set(app.uiSchema.map(field => field.key)), new Set(Object.keys(input.shape)), `${id}: UI no cubre input 1:1`)
    for (const capability of app.capabilities) {
      assert.ok(bindingsFor(capability).some(({ provider, binding }) => provider.commercialUseAllowed && binding.routable !== false), `${id}: ${capability} sin binding comercial enrutable`)
    }
    const parsed = app.inputSchema.safeParse(FIXTURES[id])
    assert.ok(parsed.success, `${id}: fixture inválido`)
    const estimate = validateMicroappEstimate(id, await app.estimateCost(parsed.success ? parsed.data : FIXTURES[id]))
    assert.ok(Number.isFinite(estimate.cents) && estimate.cents >= 0, `${id}: estimate inválido`)
    if (app.capabilities.length) assert.ok(estimate.cents > 0, `${id}: usa proveedor pero estima cero`)
  }
})

test('permisos de escritura R2 están limitados a operaciones que realmente persisten', () => {
  const appsWithWrites = IDS.map(id => getMicroapp(id)!).filter(app => app.dataAccess.some(permission => permission.endsWith('.write')))
  const actual = new Map(appsWithWrites.map(app => [app.id, app.dataAccess.filter(permission => permission.endsWith('.write')).sort()]))
  assert.deepEqual([...actual.keys()].sort(), ['knowledge-base-builder', 'workflow-synthetic-evaluator'])
  assert.deepEqual(actual.get('knowledge-base-builder'), ['knowledge.write'])
  assert.deepEqual(actual.get('workflow-synthetic-evaluator'), ['automations.write'])
})

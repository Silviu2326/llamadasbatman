process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import '../providers'
import { PERMISSIONS } from '../access-control/catalog'
import { catalogProjection, manifestProjection } from '../controllers/microapps.controller'
import { REVENUE_AGENCY_INPUT_FIXTURES, REVENUE_AGENCY_MICROAPP_IDS } from '../microapps/apps/revenueAgencyPack.catalog'
import { INTELLIGENCE_GROWTH_EXAMPLES, INTELLIGENCE_GROWTH_ID_BY_NUMBER } from '../microapps/apps/intelligenceGrowthPack21to40'
import { WAVE2_CONTENT_MEDIA_FIXTURES, WAVE2_CONTENT_MEDIA_IDS } from '../microapps/apps/wave2ContentMediaPack'
import { WAVE2_DATA_AIOPS_FIXTURES, WAVE2_DATA_AIOPS_IDS } from '../microapps/apps/wave2DataAiOpsPack'
import { getMicroapp, listMicroapps } from '../microapps/registry'
import { SELECTED_60_MICROAPPS } from '../microapps/selected60Catalog'
import { VISION_MICROAPPS } from '../microapps/visionCatalog'
import { bindingsFor } from '../providers/registry'

const IMPLEMENTED_BY_NUMBER: Record<number, string> = {
  ...REVENUE_AGENCY_MICROAPP_IDS,
  ...INTELLIGENCE_GROWTH_ID_BY_NUMBER,
  ...WAVE2_CONTENT_MEDIA_IDS,
  ...WAVE2_DATA_AIOPS_IDS,
}

const INPUT_FIXTURES: Record<string, unknown> = {
  ...REVENUE_AGENCY_INPUT_FIXTURES,
  ...Object.fromEntries(Object.entries(INTELLIGENCE_GROWTH_EXAMPLES).map(([id, example]) => [id, example.input])),
  ...WAVE2_CONTENT_MEDIA_FIXTURES,
  ...WAVE2_DATA_AIOPS_FIXTURES,
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  return schema
}

test('los tres packs implementan exactamente el mapa editorial 1–60', () => {
  assert.equal(Object.keys(IMPLEMENTED_BY_NUMBER).length, 60)
  assert.deepEqual(
    Object.keys(IMPLEMENTED_BY_NUMBER).map(Number).sort((a, b) => a - b),
    Array.from({ length: 60 }, (_, index) => index + 1),
  )
  assert.deepEqual(
    SELECTED_60_MICROAPPS.map(item => IMPLEMENTED_BY_NUMBER[item.number]),
    SELECTED_60_MICROAPPS.map(item => item.id),
  )
})

test('el arranque común publica las 60 nuevas y conserva las 87 anteriores', () => {
  const registered = listMicroapps()
  assert.equal(registered.length, 147)
  assert.equal(new Set(registered.map(app => app.id)).size, 147)
  const registeredIds = new Set(registered.map(app => app.id))
  for (const item of SELECTED_60_MICROAPPS) assert.ok(registeredIds.has(item.id), `falta #${item.number} ${item.id}`)
  for (const item of VISION_MICROAPPS) assert.ok(registeredIds.has(item.id), `regresión catálogo anterior: ${item.id}`)
})

test('los 60 manifiestos son ejecutables, autorizables y renderizables', async () => {
  const knownPermissions = new Set<string>(PERMISSIONS)
  for (const editorial of SELECTED_60_MICROAPPS) {
    const app = getMicroapp(editorial.id)
    assert.ok(app, `#${editorial.number}: no registrada`)
    assert.equal(app.name, editorial.name, `#${editorial.number}: nombre editorial distinto`)
    assert.match(app.version, /^\d+\.\d+\.\d+$/)
    assert.ok(app.promise.trim().length >= 20, `#${editorial.number}: promesa vacía`)
    assert.equal(app.effects, 'local', `#${editorial.number}: efecto externo sin aprobación explícita`)
    assert.ok(app.freshnessDays && app.freshnessDays > 0, `#${editorial.number}: sin vigencia`)
    assert.ok(unwrap(app.inputSchema) instanceof z.ZodObject, `#${editorial.number}: input no estructurado`)
    assert.ok(unwrap(app.outputSchema) instanceof z.ZodObject, `#${editorial.number}: output no estructurado`)
    assert.equal(typeof app.run, 'function')
    assert.equal(typeof app.estimateCost, 'function')

    const input = unwrap(app.inputSchema) as z.ZodObject<Record<string, ZodTypeAny>>
    const inputKeys = Object.keys(input.shape).sort()
    const uiKeys = app.uiSchema.map(field => field.key).sort()
    assert.deepEqual(uiKeys, inputKeys, `#${editorial.number}: uiSchema no cubre input`)
    assert.equal(new Set(uiKeys).size, uiKeys.length, `#${editorial.number}: campos UI duplicados`)
    for (const field of app.uiSchema) {
      assert.ok(field.label.trim(), `#${editorial.number}.${field.key}: label vacío`)
      if (field.widget === 'select') {
        assert.ok(field.options?.length, `#${editorial.number}.${field.key}: select sin opciones`)
        assert.equal(unwrap(input.shape[field.key]) instanceof z.ZodArray, false, `#${editorial.number}.${field.key}: array no debe ser select simple`)
      }
    }
    for (const permission of app.dataAccess) {
      assert.ok(knownPermissions.has(permission), `#${editorial.number}: permiso desconocido ${permission}`)
    }
    for (const capability of app.capabilities) {
      assert.ok(
        bindingsFor(capability).some(({ binding }) => binding.routable !== false),
        `#${editorial.number}: capability sin proveedor enrutable ${capability}`,
      )
    }

    const fixture = INPUT_FIXTURES[app.id]
    assert.ok(fixture !== undefined, `#${editorial.number}: sin fixture de integración`)
    assert.ok(app.inputSchema.safeParse(fixture).success, `#${editorial.number}: fixture inválido`)
    const estimate = await app.estimateCost(fixture)
    assert.ok(Number.isFinite(estimate.cents) && estimate.cents >= 0, `#${editorial.number}: coste inválido`)
    if (app.capabilities.length) assert.ok(estimate.cents > 0, `#${editorial.number}: receta de proveedor anunciada a coste cero`)
  }
})

test('API etiqueta la selección y mantiene ligero el catálogo', () => {
  for (const editorial of SELECTED_60_MICROAPPS) {
    const app = getMicroapp(editorial.id)!
    const detail = manifestProjection(app)
    assert.equal(detail.editorialNumber, editorial.number)
    assert.equal(detail.collection, editorial.collection)
    assert.equal(detail.catalogEdition, 'selected-60')
    assert.ok(detail.uiSchema.length > 0)
    assert.equal(detail.inputSchema.type, 'object')

    const catalog = catalogProjection(app) as Record<string, unknown>
    assert.equal('uiSchema' in catalog, false)
    assert.equal('inputSchema' in catalog, false)
    assert.equal('followUps' in catalog, false)
  }
})

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import '../providers'
import { PERMISSIONS } from '../access-control/catalog'
import { bindingsFor } from '../providers/registry'
import { getMicroapp, listMicroapps } from '../microapps/registry'
import { VISION_MICROAPPS } from '../microapps/visionCatalog'

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  return schema
}

test('el compromiso editorial contiene exactamente 66 números contiguos e ids únicos', () => {
  assert.equal(VISION_MICROAPPS.length, 66)
  assert.deepEqual(VISION_MICROAPPS.map(item => item.number), Array.from({ length: 66 }, (_, index) => index + 1))
  assert.equal(new Set(VISION_MICROAPPS.map(item => item.id)).size, 66)
  assert.equal(new Set(VISION_MICROAPPS.map(item => item.name)).size, 66)
})

test('las 66 ideas están registradas como contratos ejecutables, no como tarjetas vacías', () => {
  const registeredIds = new Set(listMicroapps().map(app => app.id))
  for (const item of VISION_MICROAPPS) {
    assert.ok(registeredIds.has(item.id), `#${item.number} ${item.name}: falta ${item.id}`)
    const app = getMicroapp(item.id)!
    assert.match(app.version, /^\d+\.\d+\.\d+$/)
    assert.ok(app.promise.trim().length >= 20, `#${item.number}: promesa vacía`)
    assert.equal(typeof app.run, 'function', `#${item.number}: sin handler`)
    assert.equal(typeof app.estimateCost, 'function', `#${item.number}: sin estimador`)
    assert.equal(app.effects, 'local', `#${item.number}: no debe actuar fuera sin aprobación`)
    assert.ok(app.freshnessDays && app.freshnessDays > 0, `#${item.number}: sin caducidad`)
    assert.ok(unwrap(app.inputSchema) instanceof z.ZodObject, `#${item.number}: input no estructurado`)
    assert.ok(unwrap(app.outputSchema) instanceof z.ZodObject, `#${item.number}: output no estructurado`)
  }
})

test('formularios, permisos y capabilities de las 66 microapps son resolubles', () => {
  const knownPermissions = new Set<string>(PERMISSIONS)
  for (const item of VISION_MICROAPPS) {
    const app = getMicroapp(item.id)!
    const input = unwrap(app.inputSchema) as z.ZodObject<Record<string, ZodTypeAny>>
    const inputKeys = Object.keys(input.shape).sort()
    const uiKeys = app.uiSchema.map(field => field.key).sort()
    assert.deepEqual(uiKeys, inputKeys, `#${item.number} ${item.id}: uiSchema no cubre el input`)
    assert.equal(new Set(uiKeys).size, uiKeys.length, `#${item.number}: campos UI duplicados`)
    for (const field of app.uiSchema) {
      assert.ok(field.label.trim(), `#${item.number}.${field.key}: label vacío`)
      if (field.widget === 'select') assert.ok(field.options?.length, `#${item.number}.${field.key}: select sin opciones`)
    }
    for (const permission of app.dataAccess) {
      assert.ok(knownPermissions.has(permission), `#${item.number}: permiso desconocido ${permission}`)
    }
    for (const capability of app.capabilities) {
      assert.ok(bindingsFor(capability).some(({ binding }) => binding.routable !== false), `#${item.number}: capability sin proveedor routable ${capability}`)
    }
  }
})

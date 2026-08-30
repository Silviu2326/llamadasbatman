process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://offline:offline@127.0.0.1:1/offline'
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type ZodTypeAny } from 'zod'
import '../providers'
import { PERMISSIONS } from '../access-control/catalog'
import { listMicroapps } from '../microapps/registry'
import { manifestProjection } from '../controllers/microapps.controller'
import { registerCoreCapabilityContracts } from '../providers/capabilities'
import { bindingsFor, getCapabilityContract } from '../providers/registry'

registerCoreCapabilityContracts()

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodEffects) return unwrap(schema._def.schema as ZodTypeAny)
  if (schema instanceof z.ZodDefault) return unwrap(schema._def.innerType as ZodTypeAny)
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return unwrap(schema.unwrap() as ZodTypeAny)
  return schema
}

test('el catálogo conserva exactamente 147 microapps identificables', () => {
  const apps = listMicroapps()
  assert.equal(apps.length, 147)
  assert.equal(new Set(apps.map(app => app.id)).size, 147)
  assert.equal(new Set(apps.map(app => app.name.trim().toLocaleLowerCase())).size, 147)
  for (const app of apps) {
    assert.match(app.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${app.id}: id no estable`)
    assert.match(app.version, /^\d+\.\d+\.\d+$/, `${app.id}: versión no semántica`)
    const [major, minor] = app.version.split('.').map(Number)
    assert.ok(major > 1 || (major === 1 && minor >= 1), `${app.id}: mejora sin incremento de versión`)
    assert.ok(app.name.trim().length >= 5, `${app.id}: nombre demasiado débil`)
    assert.ok(app.promise.trim().length >= 35, `${app.id}: promesa demasiado genérica`)
    assert.notEqual(manifestProjection(app).collection, 'existing', `${app.id}: microapp real sin colección editorial`)
  }
})

test('las 147 se reparten en siete colecciones explícitas y completas', () => {
  const counts = new Map<string, number>()
  for (const app of listMicroapps()) {
    const collection = manifestProjection(app).collection
    counts.set(collection, (counts.get(collection) ?? 0) + 1)
  }
  assert.deepEqual(Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))), {
    'ads-content': 19,
    'growth-sales': 29,
    'intelligence-growth': 20,
    'media-aiops': 20,
    'platform-core': 21,
    'revenue-agency': 20,
    'studio-ops': 18,
  })
})

test('cada microapp tiene contrato y formulario completos, no una caja de texto genérica', () => {
  const issues: string[] = []
  for (const app of listMicroapps()) {
    const input = unwrap(app.inputSchema)
    const output = unwrap(app.outputSchema)
    if (!(input instanceof z.ZodObject)) { issues.push(`${app.id}: input no estructurado`); continue }
    if (!(output instanceof z.ZodObject)) { issues.push(`${app.id}: output no estructurado`); continue }

    const inputKeys = Object.keys((input as z.ZodObject<Record<string, ZodTypeAny>>).shape).sort()
    const outputKeys = Object.keys((output as z.ZodObject<Record<string, ZodTypeAny>>).shape)
    const uiKeys = app.uiSchema.map(field => field.key).sort()
    if (inputKeys.length < 1) issues.push(`${app.id}: sin entradas explícitas`)
    if (outputKeys.length < 1) issues.push(`${app.id}: sin entregable explícito`)
    if (JSON.stringify(uiKeys) !== JSON.stringify(inputKeys)) issues.push(`${app.id}: uiSchema incompleto`)
    if (new Set(uiKeys).size !== uiKeys.length) issues.push(`${app.id}: campos UI duplicados`)
    const hasGuidance = app.uiSchema.some(field => Boolean((field.help ?? '').trim() || (field.placeholder ?? '').trim() || field.options?.length))
    if (!hasGuidance) issues.push(`${app.id}: formulario sin ayuda, ejemplo ni opciones`)

    for (const field of app.uiSchema) {
      if (field.label.trim().length < 3) issues.push(`${app.id}.${field.key}: label débil`)
      if (field.widget === 'select') {
        if (!field.options?.length) issues.push(`${app.id}.${field.key}: select sin opciones`)
        if (unwrap((input as z.ZodObject<Record<string, ZodTypeAny>>).shape[field.key]) instanceof z.ZodArray) issues.push(`${app.id}.${field.key}: array presentado como select simple`)
      }
    }
  }
  assert.deepEqual(issues, [], issues.join('\n'))
})

test('cada microapp declara vigencia, siguiente acción, permisos y routing verificables', () => {
  const knownPermissions = new Set<string>(PERMISSIONS)
  const issues: string[] = []
  for (const app of listMicroapps()) {
    if (!Number.isInteger(app.freshnessDays) || (app.freshnessDays ?? 0) < 1 || (app.freshnessDays ?? 0) > 365) issues.push(`${app.id}: vigencia inválida`)
    if (app.followUps.length < 1) issues.push(`${app.id}: sin siguiente acción`)
    if (new Set(app.followUps.map(action => `${action.kind}:${action.label}`)).size !== app.followUps.length) issues.push(`${app.id}: acciones duplicadas`)
    for (const action of app.followUps) {
      if (action.kind.trim().length < 3) issues.push(`${app.id}: kind de acción vacío`)
      if (action.label.trim().length < 5) issues.push(`${app.id}: label de acción débil`)
    }

    if (new Set(app.capabilities).size !== app.capabilities.length) issues.push(`${app.id}: capabilities duplicadas`)
    for (const capability of app.capabilities) {
      if (!getCapabilityContract(capability)) issues.push(`${app.id}: capability sin contrato ${capability}`)
      if (!bindingsFor(capability).some(({ binding }) => binding.routable !== false)) issues.push(`${app.id}: capability sin proveedor enrutable ${capability}`)
    }

    if (new Set(app.dataAccess).size !== app.dataAccess.length) issues.push(`${app.id}: permisos duplicados`)
    for (const permission of app.dataAccess) if (!knownPermissions.has(permission)) issues.push(`${app.id}: permiso desconocido ${permission}`)
    if (app.effects === 'external' && !app.approvalAction?.trim()) issues.push(`${app.id}: efecto externo sin aprobación declarada`)
  }
  assert.deepEqual(issues, [], issues.join('\n'))
})

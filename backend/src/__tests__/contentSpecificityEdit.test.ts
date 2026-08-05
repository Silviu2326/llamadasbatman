import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTestOrg, cleanupOrgs } from './testHelpers'
import { prisma } from '../lib/prisma'
import { editPiece } from '../services/contentApproval.service'

/**
 * Editar a mano y el chequeo de especificidad (idea 27).
 *
 * Encontrado en la pasada de QA del circuito completo: al guardar una edición,
 * la pieza decía "no hay nada en la Base de conocimiento" **teniéndola llena**.
 * El informe guardaba un cero fijo, y la pantalla lo leía como "este negocio no
 * tiene datos" cuando lo que pasaba era otra cosa: que una edición humana no se
 * reescribe sola. Son dos verdades distintas y el usuario no puede distinguirlas
 * si el número miente.
 */

let org: Awaited<ReturnType<typeof createTestOrg>>

before(async () => {
  org = await createTestOrg()
  await prisma.knowledgeBase.create({
    data: {
      orgId: org.id,
      name: 'Ficha de empresa',
      type: 'document',
      content: 'Instalamos aerotermia desde 2019.\nGarantía de 5 años en todas nuestras instalaciones.',
    },
  })
})

after(async () => {
  await prisma.contentPieceEvent.deleteMany({ where: { orgId: org.id } })
  await prisma.contentPiece.deleteMany({ where: { orgId: org.id } })
  await prisma.knowledgeBase.deleteMany({ where: { orgId: org.id } })
  await cleanupOrgs([org.id])
})

test('una edición a mano se marca, no se reescribe, y no niega la base de conocimiento', async () => {
  const piece = await prisma.contentPiece.create({
    data: { orgId: org.id, format: 'post', body: { text: 'Texto original.' }, status: 'pending_approval' },
  })

  const editado = 'Somos instaladores con amplia experiencia y máxima garantía.'
  const updated = await editPiece(org.id, piece.id, { text: editado })
  const report = updated.specificity as {
    replaced: number
    unresolved: number
    factsAvailable: number
    afterHumanEdit: boolean
    flags: { phrase: string; replacedWith: string | null }[]
  }

  // El texto es de quien lo escribió: se marca, pero no se toca.
  assert.deepEqual(updated.body, { text: editado })
  assert.equal(updated.editedByHuman, true)
  assert.equal(report.replaced, 0)
  assert.equal(report.unresolved, 2)
  assert.deepEqual(report.flags.map(flag => flag.replacedWith), [null, null])
  assert.equal(report.afterHumanEdit, true)

  // Y la cifra describe al negocio, no a la decisión de no reescribir: la base
  // de conocimiento tiene datos y el informe tiene que decirlo.
  assert.ok(report.factsAvailable > 0, 'la base de conocimiento tiene datos y el informe los cuenta')
})

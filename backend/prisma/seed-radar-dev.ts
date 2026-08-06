import { prisma } from '../src/lib/prisma'

/**
 * Dataset sintético para el Radar (`docs/vendrava/pantallas.md` §1).
 *
 * `roadmap.md` ya anticipaba este riesgo: sin transcripciones, el Radar sale
 * vacío y no hay forma de saber si el detector funciona o si simplemente no
 * encuentra nada. Estas llamadas llevan señales **plantadas a propósito** y
 * contadas, para poder comprobar dos cosas distintas:
 *
 * 1. que encuentra lo que sí está (la objeción del plazo aparece 8 veces);
 * 2. que **no** inventa lo que no está (nadie menciona financiación).
 *
 * Las transcripciones incluyen PII realista —nombres, teléfonos, emails— porque
 * el objetivo es también verificar que la seudonimización la retiene antes de
 * que ningún texto salga hacia el modelo.
 */

const ORG_ID = 'local-development-org'

/** Señal repetida: la objeción estrella. 8 menciones. */
const PLAZO = [
  '¿Cuánto tardáis en instalarlo? Me han dicho que tres semanas y no puedo esperar tanto.',
  'Mi única duda es el plazo. Necesito que esté antes de fin de mes.',
  'Lo que me echa para atrás es cuánto se tarda. ¿Es verdad que son semanas?',
  'Necesito saber el plazo exacto de instalación antes de decidirme.',
  '¿En cuánto tiempo lo tendría funcionando? El anterior presupuesto decía un mes.',
  'Me preocupa el tiempo de instalación, tengo la obra parada esperando.',
  'Si tardáis más de una semana no me sirve, ¿cuánto es realmente?',
  'La duda del plazo es la que me frena, todo lo demás lo veo bien.',
]

/** Segunda señal: pago por adelantado. 5 menciones. */
const PAGO = [
  '¿Hay que pagarlo todo por adelantado o se puede fraccionar?',
  'No me gusta pagar el total antes de ver el trabajo hecho.',
  '¿Se paga al final o hay que adelantar dinero?',
  'Lo del pago por adelantado me genera desconfianza, la verdad.',
  '¿Puedo pagar la mitad al empezar y la otra mitad al terminar?',
]

/** Tercera señal: comparación con competidor. 3 menciones. */
const COMPETIDOR = [
  'He pedido presupuesto también a otra empresa y me sale más barato, ¿por qué la diferencia?',
  'La competencia me ofrece lo mismo por menos, ¿qué incluís vosotros?',
  'Estoy comparando con otro instalador de la zona, ¿en qué sois mejores?',
]

/** Ruido: conversaciones sin señal aprovechable. */
const RUIDO = [
  'Solo llamaba para confirmar la cita del jueves.',
  'Quería saber si estáis abiertos el sábado por la mañana.',
  'Me he equivocado de número, perdón.',
  'Llamo para cambiar la dirección de la factura.',
]

const NOMBRES = [
  'Marta Ruiz', 'Javier Soler', 'Lucía Ferrer', 'Andrés Molina', 'Carmen Prieto',
  'Pablo Iglesias Ramos', 'Nuria Castaño', 'Sergio Bermúdez', 'Elena Vidal', 'Tomás Arenas',
]

function transcript(nombre: string, telefono: string, email: string, frase: string) {
  return [
    `Agente: Buenos días, ¿hablo con ${nombre}?`,
    'Cliente: Sí, soy yo.',
    `Agente: Le confirmo el teléfono ${telefono} y el correo ${email}, ¿correcto?`,
    'Cliente: Correcto.',
    `Cliente: ${frase}`,
    'Agente: Entiendo. Se lo detallo ahora mismo y le paso la propuesta por escrito.',
    'Cliente: Perfecto, quedo atento.',
  ].join('\n')
}

async function main() {
  const org = await prisma.organization.findUnique({ where: { id: ORG_ID }, select: { id: true } })
  if (!org) throw new Error(`No existe la organización ${ORG_ID}`)

  // Se borran las llamadas antes que los leads: `Call.leadId` es obligatorio.
  await prisma.call.deleteMany({ where: { orgId: ORG_ID, externalCallId: { startsWith: 'radar-demo-' } } })
  await prisma.lead.deleteMany({ where: { orgId: ORG_ID, externalLeadId: { startsWith: 'radar-demo-' } } })

  const frases = [
    ...PLAZO.map(frase => ({ frase, señal: 'plazo' })),
    ...PAGO.map(frase => ({ frase, señal: 'pago' })),
    ...COMPETIDOR.map(frase => ({ frase, señal: 'competidor' })),
    ...RUIDO.map(frase => ({ frase, señal: 'ruido' })),
  ]

  let created = 0
  for (const [index, item] of frases.entries()) {
    const nombre = NOMBRES[index % NOMBRES.length]
    const telefono = `+34 6${String(10_000_000 + index * 137).slice(0, 8)}`
    const email = `${nombre.split(' ')[0].toLowerCase()}${index}@correo.es`

    // El lead da el nombre real que la seudonimización tiene que retener.
    const lead = await prisma.lead.create({
      data: {
        orgId: ORG_ID,
        externalLeadId: `radar-demo-${index}`,
        name: nombre,
        phone: telefono,
        email,
        source: 'radar-demo',
      },
    })

    await prisma.call.create({
      data: {
        orgId: ORG_ID,
        leadId: lead.id,
        externalCallId: `radar-demo-${index}`,
        status: 'completed',
        direction: 'inbound',
        outcome: item.señal === 'ruido' ? 'none' : 'interested',
        transcript: transcript(nombre, telefono, email, item.frase),
        // Repartidas dentro de los últimos 7 días: la ventana que analiza el job.
        createdAt: new Date(Date.now() - (index % 7) * 24 * 60 * 60 * 1000 - 3_600_000),
      },
    })
    created += 1
  }

  console.log(`llamadas creadas: ${created}`)
  console.log('señales plantadas → plazo: 8 · pago: 5 · competidor: 3 · ruido: 4')
  console.log('señal ausente a propósito: financiación (si el detector la propone, se la está inventando)')
  await prisma.$disconnect()
}

main().catch(error => { console.error(error); process.exit(1) })

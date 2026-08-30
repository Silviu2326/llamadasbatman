import assert from 'node:assert/strict'
import test from 'node:test'
import {
  observeContacts,
  pickIntakeLinks,
  verifyQuote,
  type IntakePage,
} from '../services/websiteIntake.crawler'
import { buildProposal } from '../services/websiteIntake.service'

const HOME_HTML = `<html><head><title>Clínica Sonrisa</title></head><body>
  <a href="/nosotros">Quiénes somos</a>
  <a href="/servicios">Servicios</a>
  <a href="/servicios/ortodoncia">Ortodoncia</a>
  <a href="/precios">Tarifas</a>
  <a href="https://instagram.com/clinicasonrisa">Instagram</a>
  <a href="https://otrodominio.com/precios">Otro</a>
  <a href="/folleto.pdf">Folleto</a>
  <a href="mailto:hola@sonrisa.es">hola@sonrisa.es</a>
  <a href="tel:+34911234567">911 234 567</a>
</body></html>`

function page(url: string, text: string, html = ''): IntakePage {
  return { url, title: null, text, html }
}

test('elige un enlace interno por categoría y descarta externos, duplicados y ficheros', () => {
  const links = pickIntakeLinks(HOME_HTML, 'https://sonrisa.es/')
  assert.deepEqual(links, [
    'https://sonrisa.es/nosotros',
    'https://sonrisa.es/servicios',
    'https://sonrisa.es/precios',
  ])
})

test('observa los contactos que la web publica de verdad', () => {
  const observed = observeContacts([page('https://sonrisa.es/', 'Llámanos al 911 234 567', HOME_HTML)])
  assert.ok(observed.emails.has('hola@sonrisa.es'))
  assert.ok(observed.phoneDigits.includes('34911234567'))
  assert.equal(observed.socials.instagram, 'https://instagram.com/clinicasonrisa')
})

test('una cita solo vale si aparece literalmente en alguna página', () => {
  const pages = [page('https://sonrisa.es/', 'Atendemos urgencias el mismo día en Madrid centro.')]
  assert.equal(verifyQuote('Atendemos urgencias el mismo día', pages), true)
  // Tolera mayúsculas, acentos y comillas...
  assert.equal(verifyQuote('"ATENDEMOS URGENCIAS EL MISMO DIA"', pages), true)
  // ...pero no una frase que la web no contiene.
  assert.equal(verifyQuote('Somos la clínica número uno de España', pages), false)
  // Ni una cita demasiado corta para significar nada.
  assert.equal(verifyQuote('urgencias', pages), false)
})

test('la propuesta descarta lo que el modelo no puede sostener con la web', () => {
  const pages = [page(
    'https://sonrisa.es/',
    'Clínica Sonrisa. Atendemos urgencias el mismo día. Escríbenos a hola@sonrisa.es o llama al 911 234 567. Primera revisión por 49 euros.',
    HOME_HTML,
  )]
  const observed = observeContacts(pages)

  const proposal = buildProposal({
    pages,
    observed,
    website: 'https://sonrisa.es',
    finalUrl: 'https://sonrisa.es/',
    scopes: ['profile', 'team', 'knowledge', 'crm'],
    providerId: 'openai-chat',
    analyzedAt: '2026-08-27T10:00:00.000Z',
    model: {
      company: {
        name: 'Clínica Sonrisa',
        industry: 'Odontología',
        email: 'contacto@sonrisa-inventada.es',
        phone: '600 000 000',
        address: 'Calle Inventada 4',
      },
      profile: {
        description: 'Clínica dental con urgencias el mismo día.',
        valueProposition: 'Atención dental sin esperas.',
        differentiators: ['Urgencias el mismo día'],
        offers: [
          { name: 'Primera revisión', priceCents: 4900, currency: 'EUR', billingPeriod: 'one_time', quote: 'Primera revisión por 49 euros', url: 'https://sonrisa.es/' },
          { name: 'Blanqueamiento', priceCents: 19900, currency: 'EUR', billingPeriod: 'one_time' },
        ],
      },
      team: [
        { name: 'Ana Ruiz', email: 'hola@sonrisa.es', title: 'Directora' },
        { name: 'Luis Pérez', email: 'luis@sonrisa.es' },
      ],
      knowledge: [
        { name: 'Urgencias', content: 'La clínica atiende urgencias el mismo día que se solicitan.', quote: 'Atendemos urgencias el mismo día', url: 'https://sonrisa.es/' },
        { name: 'Parking', content: 'La clínica dispone de parking gratuito para pacientes.', quote: 'Parking gratuito para pacientes' },
      ],
      contacts: [
        { name: 'Recepción', email: 'hola@sonrisa.es' },
        { name: 'Comercial', email: 'ventas@otraweb.com' },
      ],
      evidence: [
        { path: 'company.name', url: 'https://sonrisa.es/', quote: 'Clínica Sonrisa. Atendemos urgencias' },
        { path: 'company.address', url: 'https://sonrisa.es/', quote: 'Calle Inventada 4, Madrid' },
        { path: 'profile.valueProposition', url: 'https://sonrisa.es/', quote: 'Atendemos urgencias el mismo día' },
      ],
    },
  })

  // Email y teléfono que no están en la web: fuera, con aviso.
  assert.equal(proposal.company.email.value, '')
  assert.equal(proposal.company.phone.value, '')
  // Dirección con cita que la web no contiene: fuera.
  assert.equal(proposal.company.address.value, '')
  assert.equal(proposal.warnings.length >= 3, true)

  // Lo sostenido por la web se queda.
  assert.equal(proposal.company.name.value, 'Clínica Sonrisa')
  assert.equal(proposal.profile.valueProposition.verified, true)

  // El precio con cita literal sobrevive; el inventado se queda sin precio.
  assert.equal(proposal.profile.offers[0].priceCents, 4900)
  assert.equal(proposal.profile.offers[1].name, 'Blanqueamiento')
  assert.equal(proposal.profile.offers[1].priceCents, null)

  // Equipo: solo quien tiene un email publicado en la web, y siempre viewer.
  assert.deepEqual(proposal.team.map(member => member.email), ['hola@sonrisa.es'])
  assert.equal(proposal.team[0].suggestedRole, 'viewer')

  // Conocimiento: solo fichas con cita verificada.
  assert.deepEqual(proposal.knowledge.map(entry => entry.name), ['Urgencias'])

  // CRM: cuenta con dominio y solo contactos observados.
  assert.equal(proposal.crm.account?.domain, 'sonrisa.es')
  assert.deepEqual(proposal.crm.contacts.map(contact => contact.email), ['hola@sonrisa.es'])
})

test('sin el alcance de perfil no se propone nada del perfil', () => {
  const pages = [page('https://sonrisa.es/', 'Clínica Sonrisa. Atendemos urgencias el mismo día.', HOME_HTML)]
  const proposal = buildProposal({
    pages,
    observed: observeContacts(pages),
    website: 'https://sonrisa.es',
    finalUrl: 'https://sonrisa.es/',
    scopes: ['crm'],
    providerId: 'openai-chat',
    analyzedAt: '2026-08-27T10:00:00.000Z',
    model: {
      company: { name: 'Clínica Sonrisa' },
      profile: { description: 'Algo', offers: [{ name: 'Revisión', priceCents: 1000 }] },
      team: [{ name: 'Ana', email: 'hola@sonrisa.es' }],
    },
  })
  assert.equal(proposal.profile.description.value, '')
  assert.deepEqual(proposal.profile.offers, [])
  assert.deepEqual(proposal.team, [])
  assert.equal(proposal.crm.account?.name, 'Clínica Sonrisa')
})

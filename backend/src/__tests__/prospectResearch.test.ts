import { test } from 'node:test'
import assert from 'node:assert/strict'
import { htmlToText, pickInternalLinks, verifyFacts, type ResearchSource } from '../services/prospectResearch.service'

/**
 * La cadena de investigación se gana el derecho a existir en `verifyFacts`: el
 * modelo propone hechos con cita y el código comprueba que la cita está
 * realmente en la página. Si esto se rompe, el producto pasa de "escribe sobre
 * hechos verificados" a "escribe cosas plausibles sobre desconocidos".
 */

const source = (url: string, text: string): ResearchSource => ({ url, title: null, text })

const sources = [
  source('https://ejemplo.es', 'Somos una clínica dental en Valencia desde 2009. Cerramos los lunes por la mañana.'),
  source('https://ejemplo.es/precios', 'La primera consulta es gratuita para nuevos pacientes.'),
]

test('un hecho con cita literal sobrevive', () => {
  const { kept, discarded } = verifyFacts(
    [{ claim: 'Cierran los lunes por la mañana', url: 'https://ejemplo.es', quote: 'Cerramos los lunes por la mañana' }],
    sources,
  )
  assert.equal(kept.length, 1)
  assert.equal(discarded, 0)
})

test('una cita inventada se tira', () => {
  const { kept, discarded } = verifyFacts(
    [{ claim: 'Tienen cinco clínicas en España', url: 'https://ejemplo.es', quote: 'Contamos con cinco clínicas repartidas por España' }],
    sources,
  )
  assert.deepEqual(kept, [])
  assert.equal(discarded, 1)
})

test('una cita real pero atribuida a otra página se tira', () => {
  // El modelo acierta el texto y falla la fuente: el email citaría mal.
  const { kept } = verifyFacts(
    [{ claim: 'La primera consulta es gratis', url: 'https://ejemplo.es', quote: 'La primera consulta es gratuita' }],
    sources,
  )
  assert.deepEqual(kept, [])
})

test('las diferencias de acentos, mayúsculas y comillas no invalidan una cita real', () => {
  const { kept } = verifyFacts(
    [{ claim: 'Clínica dental en Valencia', url: 'https://ejemplo.es', quote: '«Somos una clinica dental en VALENCIA»' }],
    sources,
  )
  assert.equal(kept.length, 1)
})

test('una cita demasiado corta no sostiene nada', () => {
  // "en Valencia" aparece, pero como cita no prueba el hecho que se afirma.
  const { kept, discarded } = verifyFacts(
    [{ claim: 'Están en Valencia', url: 'https://ejemplo.es', quote: 'Valencia' }],
    sources,
  )
  assert.deepEqual(kept, [])
  assert.equal(discarded, 1)
})

test('los hechos repetidos se cuentan una vez', () => {
  const { kept, discarded } = verifyFacts(
    [
      { claim: 'Cierran los lunes', url: 'https://ejemplo.es', quote: 'Cerramos los lunes por la mañana' },
      { claim: 'cierran LOS lunes', url: 'https://ejemplo.es', quote: 'Cerramos los lunes por la mañana' },
    ],
    sources,
  )
  assert.equal(kept.length, 1)
  assert.equal(discarded, 1)
})

test('el texto plano ignora scripts, estilos y etiquetas', () => {
  const text = htmlToText('<html><head><style>a{color:red}</style><script>var x="oculto"</script></head><body><h1>Panadería  Luz</h1><!-- nota --><p>Abrimos&nbsp;a las 7</p></body></html>')
  assert.equal(text, 'Panadería Luz Abrimos a las 7')
  assert.ok(!text.includes('oculto'))
  assert.ok(!text.includes('color:red'))
})

test('solo se siguen enlaces internos y de páginas que dicen algo', () => {
  const html = `
    <a href="/sobre-nosotros">Quiénes somos</a>
    <a href="/servicios">Servicios</a>
    <a href="https://facebook.com/negocio">Facebook</a>
    <a href="/aviso-legal">Aviso legal</a>
    <a href="/catalogo.pdf">Catálogo</a>
  `
  const links = pickInternalLinks(html, 'https://ejemplo.es')
  assert.deepEqual(links, ['https://ejemplo.es/sobre-nosotros', 'https://ejemplo.es/servicios'])
})

test('no se sigue dos veces la misma categoría de página', () => {
  // Cinco variantes de "servicios" enseñan menos que una de cada cosa.
  const html = `
    <a href="/servicios">Servicios</a>
    <a href="/servicios/limpieza">Limpieza</a>
    <a href="/servicios/ortodoncia">Ortodoncia</a>
    <a href="/precios">Tarifas</a>
  `
  const links = pickInternalLinks(html, 'https://ejemplo.es')
  assert.deepEqual(links, ['https://ejemplo.es/servicios', 'https://ejemplo.es/precios'])
})

test('la home no se vuelve a visitar como enlace interno', () => {
  const links = pickInternalLinks('<a href="/">Inicio</a><a href="/contacto">Contacto</a>', 'https://ejemplo.es')
  assert.deepEqual(links, ['https://ejemplo.es/contacto'])
})

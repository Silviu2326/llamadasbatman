import Anthropic from '@anthropic-ai/sdk'
import { GuruBrief, VALID_ESTRUCTURAS, VALID_FORMATOS, defaultBrief } from './guruBrief'

// 8 objection patterns
const OBJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/caro|precio|coste|costes|presupuest|dinero|barato|no puedo pagar/i, 'es_caro'],
  [/ya (tenemos|tengo|usamos|uso|contamos|disponemos)|tenemos software|ya (lo )?cubrimos/i, 'ya_tenemos'],
  [/no (es el |es )?(buen|mejor) momento|ahora no|este año no|más adelante|en otro momento/i, 'no_es_buen_momento'],
  [/consultar|consulto|decidir|jefe|socio|director|comité|reunión|aprobación/i, 'necesito_consultarlo'],
  [/manda|mandame|envía|envíame|correo|email|información|catálogo|dossier|pdf/i, 'mandame_info'],
  [/no (me )?interesa|no (lo )?necesito|no es para nosotros|no veo|no creo|no aplica/i, 'no_me_interesa'],
  [/no tengo tiempo|estoy muy ocupado|ahora no puedo|llama otro día|es mal momento/i, 'no_tengo_tiempo'],
  [/sarcas|irónio|ironía|claro que sí|seguro que sí|como no|ja(ja)+/i, 'sarcastico'],
]

const OBJECTION_PLAYBOOK: Record<string, Partial<GuruBrief>> = {
  es_caro:              { estructura: 'SANDLER', formato: 'consultivo', tono: 'profesional_cercano', siguienteObjetivo: 'Reencuadra el precio como inversión. Calcula el ROI.', fraseGuia: '¿Cuánto os cuesta una ausencia sin avisar?', prohibiciones: ['justificar el precio', 'ofrecer descuento sin preguntar'] },
  ya_tenemos:           { estructura: 'CHALLENGER', formato: 'challenger', siguienteObjetivo: 'Descubre la grieta en lo que tienen.', fraseGuia: '¿Y cómo os funciona la parte de confirmaciones automáticas?', prohibiciones: ['atacar al competidor'] },
  no_es_buen_momento:   { estructura: 'BYAF', formato: 'cercano', tono: 'empatico_profesional', siguienteObjetivo: 'Quita la presión. ¿Cuándo sería mejor?', prohibiciones: ['insistir', 'crear urgencia artificial'] },
  necesito_consultarlo: { estructura: 'SANDLER', formato: 'directo', siguienteObjetivo: 'Identifica el decisor. Compromete siguiente paso concreto.', fraseGuia: '¿Quién más estaría involucrado en esta decisión?', prohibiciones: ['aceptar ya te llamo', 'cerrar sin siguiente paso'] },
  mandame_info:         { estructura: 'CONSULTIVA', formato: 'cercano', siguienteObjetivo: 'Averigua qué info específica necesita.', fraseGuia: '¿Qué punto concreto te gustaría que cubriera?', prohibiciones: ['prometer catálogo genérico'] },
  no_me_interesa:       { estructura: 'PAS', formato: 'challenger', siguienteObjetivo: 'Despierta el problema latente.', fraseGuia: '¿Sabéis cuántas ausencias tenéis al mes exactamente?', prohibiciones: ['insistir directamente'] },
  no_tengo_tiempo:      { estructura: 'SNAP', formato: 'snap', tono: 'directo', siguienteObjetivo: '30 segundos, una sola idea.', fraseGuia: 'En 20 segundos: reducimos ausencias un 40%. ¿Eso os preocupa?', prohibiciones: ['más de 2 frases', 'pedir tiempo'] },
  sarcastico:           { estructura: 'CONSULTIVA', formato: 'empatico', tono: 'empatico_profesional', siguienteObjetivo: 'Baja el volumen. Una pregunta genuina.', prohibiciones: ['responder al sarcasmo', 'argumentos de venta'] },
}

export function detectObjection(text: string): string {
  for (const [re, type] of OBJECTION_PATTERNS) {
    if (re.test(text)) return type
  }
  return ''
}

export function detectLoop(agentResponses: string[]): boolean {
  if (agentResponses.length < 3) return false
  const sets = agentResponses.slice(-3).map(r => new Set(r.toLowerCase().split(/\s+/)))
  const common = [...sets[0]].filter(w => sets[1].has(w) && sets[2].has(w))
  const total = new Set([...sets[0], ...sets[1], ...sets[2]])
  return total.size > 0 && common.length / total.size > 0.50
}

export function detectStall(neutralTurns: number): boolean {
  return neutralTurns >= 4
}

function pickUntried(candidates: string[], tried: string[]): string {
  return candidates.find(c => !tried.includes(c)) ?? candidates[0]
}

export function fastDispatch(params: {
  current: GuruBrief; emocion: string; estadoAcustico: string
  loop: boolean; stall: boolean; objecionTipo: string; triedEstructuras: string[]
}): GuruBrief {
  const { current, emocion, estadoAcustico, loop, stall, objecionTipo, triedEstructuras } = params
  let brief = { ...current }

  if (objecionTipo && OBJECTION_PLAYBOOK[objecionTipo]) {
    return { ...brief, ...OBJECTION_PLAYBOOK[objecionTipo], bucleDetectado: loop, stallDetectado: stall, objecionTipo } as GuruBrief
  }

  if (emocion === 'molesto') { brief.estructura = pickUntried(['CONSULTIVA', 'BYAF', 'FAB'], triedEstructuras); brief.formato = 'empatico'; brief.maxFrases = 2 }
  else if (emocion === 'interesado') { brief.estructura = pickUntried(['FAB', 'VALUE', 'STORYTELLING'], triedEstructuras); brief.formato = 'mini_closer' }
  else if (emocion === 'sarcastico') { brief.estructura = 'CONSULTIVA'; brief.formato = 'empatico' }

  if (estadoAcustico === 'agitado') { brief.formato = 'empatico'; brief.maxFrases = Math.min(brief.maxFrases, 2) }
  else if (estadoAcustico === 'plano' && emocion === 'neutro') { brief.estructura = pickUntried(['CHALLENGER', 'PAS', 'STORYTELLING'], triedEstructuras) }

  if (stall) brief.estructura = pickUntried(['CHALLENGER', 'PAS', 'BYAF', 'STORYTELLING'], triedEstructuras)
  if (loop) brief.estructura = pickUntried(['STORYTELLING', 'BYAF', 'NEAT', 'VALUE'], triedEstructuras)

  return { ...brief, bucleDetectado: loop, stallDetectado: stall, objecionTipo }
}

const ESTRUCTURA_GUIDE = `AIDA: apertura — Atención→Interés→Deseo→Acción
SPIN: descubrimiento — Situación→Problema→Implicación→Necesidad
SNAP: decisores ocupados — Simple,Invaluable,Alineado,Prioritario
CHALLENGER: prospectos cómodos — Enseñar→Adaptar→Tomar control
CONSULTIVA: construir confianza — Diagnóstico→Reflexión→Hipótesis
SANDLER: acabar con "lo pensaré" — Contratos proceso/tiempo/dolor
FAB: valor tangible — Feature→Advantage→Benefit (en euros)
STORYTELLING: valor memorable — Situación→Problema→Solución→Resultado
PAS: despertar problema — Problem→Agitate→Solve
BYAF: cierre sin presión — "puedes... pero eres libre de decir no"
NEAT: cualificación B2B — Need→Economic Impact→Access→Timeline
SOLUTION: liderar con la solución, retroceder al problema
VALUE: ROI puro — todo en euros, nunca features`

const FORMATO_GUIDE = `directo: frases cortas, beneficio primero
cercano: nombre del prospecto, valida, humor ligero
consultivo: preguntas diagnóstico, vocabulario sector
challenger: perspectiva inesperada, contradice con datos
storyteller: narrativa, casos reales, emoción + números
snap: una idea por turno, números, propuesta en 1ª frase
empatico: espeja lenguaje, validación, cero venta
urgente: escasez real, FOMO legítimo
tecnico: profundiza en cómo funciona
social_proof: cada claim respaldado por cliente real
mini_closer: micro-compromisos cada 2 turnos`

export class GuruSupervisor {
  private _client: Anthropic

  constructor(apiKey: string, private model = 'claude-sonnet-4-6') {
    this._client = new Anthropic({ apiKey })
  }

  async analyzeAndBrief(params: {
    conversationHistory: Array<{ role: string; content?: string; text?: string }>
    lastResponse: string
    objective: string
    callContext?: Record<string, unknown>
    emocion: string
    estadoAcustico: string
    loopDetected: boolean
    stallDetected: boolean
    objecionTipo: string
    triedEstructuras: string[]
  }): Promise<GuruBrief> {
    const { conversationHistory, lastResponse, objective, callContext = {}, emocion, estadoAcustico, loopDetected, stallDetected, objecionTipo, triedEstructuras } = params

    const historyText = conversationHistory.slice(-8).map(m => {
      const t = (m.content || (m as any).text || '').slice(0, 200)
      return m.role === 'user' ? `Prospecto: ${t}` : `Agente: ${t}`
    }).join('\n')

    const signals: string[] = []
    if (loopDetected) signals.push('BUCLE DETECTADO: el agente ha repetido las mismas tácticas')
    if (stallDetected) signals.push('STALL: varios turnos sin señal de progreso')
    if (objecionTipo) signals.push(`OBJECIÓN ACTIVA: ${objecionTipo}`)
    if (emocion !== 'neutro') signals.push(`Emoción: ${emocion}`)
    if (!['desconocido', 'calmado'].includes(estadoAcustico)) signals.push(`Acústico: ${estadoAcustico}`)

    const prompt = `Eres el estratega de una IA de ventas telefónica. Genera instrucciones para el próximo turno.

ESTRUCTURAS: ${ESTRUCTURA_GUIDE}
FORMATOS: ${FORMATO_GUIDE}

CONTEXTO:
- Empresa: ${callContext.company ?? 'desconocida'}
- Sector: ${callContext.niche ?? 'desconocido'}
- Objetivo: ${objective}
- Estructuras ya probadas (evitar): ${triedEstructuras.join(', ') || 'ninguna'}

HISTORIAL RECIENTE:
${historyText || '(inicio)'}

ÚLTIMA RESPUESTA DEL AGENTE:
${lastResponse || '(ninguna)'}

SEÑALES:
${signals.map(s => `- ${s}`).join('\n') || '- Sin señales'}

Responde SOLO con JSON válido:
{"estructura":"una de 13","formato":"uno de 11","siguiente_objetivo":"qué lograr ahora (específico)","tono":"empatico_profesional|profesional_cercano|entusiasta_profesional|directo","max_frases":3,"frase_guia":"frase adaptable o null","puntos_clave":[],"prohibiciones":[]}`

    try {
      const res = await this._client.messages.create({
        model: this.model,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }, { timeout: 12000 })

      const text = (res.content[0] as any).text?.trim() ?? ''
      const m = text.match(/\{[\s\S]*\}/)
      const data = JSON.parse(m ? m[0] : text)

      const rawE = data.estructura ?? 'AIDA'
      const rawF = data.formato ?? 'cercano'
      return {
        objetivo: objective,
        estructura: VALID_ESTRUCTURAS.has(rawE) ? rawE : 'AIDA',
        formato: VALID_FORMATOS.has(rawF) ? rawF : 'cercano',
        tono: data.tono ?? 'profesional_cercano',
        maxFrases: Math.max(1, Math.min(4, parseInt(data.max_frases) || 3)),
        siguienteObjetivo: data.siguiente_objetivo ?? '',
        fraseGuia: data.frase_guia ?? '',
        puntosClave: data.puntos_clave ?? [],
        prohibiciones: data.prohibiciones ?? [],
        bucleDetectado: loopDetected,
        objecionTipo,
        stallDetectado: stallDetected,
      }
    } catch (e) {
      console.warn('[GURU] Claude falló, usando fast_dispatch:', e)
      return fastDispatch({
        current: defaultBrief(),
        emocion, estadoAcustico,
        loop: loopDetected, stall: stallDetected,
        objecionTipo, triedEstructuras,
      })
    }
  }

  async close(): Promise<void> {}
}

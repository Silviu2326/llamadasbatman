/**
 * Catálogo de estrategias de email frío.
 *
 * Son **datos**, no código: ni el redactor ni el juez conocen ninguna
 * estrategia concreta: reciben la que toque y la aplican. Añadir una es
 * escribir un objeto aquí — la misma decisión que se tomó con los módulos
 * verticales en `verticalModules.ts`.
 *
 * Cada estrategia se define por tres cosas que el modelo necesita saber y no
 * puede deducir: cómo se estructura, cuándo funciona y —lo que más importa—
 * cuándo NO usarla. Un catálogo sin `avoidWhen` acaba con el modelo eligiendo
 * siempre la más llamativa.
 */

/**
 * `outbound` es el primer contacto. `followup` es todo lo que viene después,
 * y no es el mismo oficio: el primero tiene que ganarse la atención de cero,
 * el segundo escribe a alguien que ya te ignoró una vez y no puede repetir el
 * argumento que no funcionó.
 */
export type EmailKind = 'outbound' | 'followup'

export interface EmailStrategy {
  id: string
  kind: EmailKind
  /** Nombre para la pantalla. */
  name: string
  /** Una línea para que el selector sepa qué es sin leer la guía entera. */
  summary: string
  /** El esqueleto del email. */
  structure: string
  /** Reglas propias de este estilo, que se suman a las reglas generales. */
  guidance: string
  useWhen: string
  avoidWhen: string
  /** Palabras aproximadas del cuerpo. El juez penaliza pasarse. */
  targetWords: [number, number]
  /**
   * `true` si necesita casos o resultados reales del remitente. Se ofrece solo
   * cuando la base de conocimiento tiene material: prometer un caso que no
   * existe es la única forma de que este sistema mienta.
   */
  requiresCaseMaterial?: boolean
}

export const EMAIL_STRATEGIES: EmailStrategy[] = [
  {
    id: 'diagnostico',
    kind: 'outbound',
    name: 'Diagnóstico consultivo',
    summary: 'Un hallazgo concreto, lo que les está costando, y una pregunta pequeña.',
    structure: '1) El hallazgo, en concreto y sin tecnicismos. 2) Qué significa eso en clientes o dinero. 3) Una pregunta de una palabra.',
    guidance: `Escribe como quien ha mirado el negocio, no como quien vende auditorías.
No enumeres varios problemas: uno, el que más cuesta.
Traduce siempre lo técnico a consecuencia: "quien te busca desde el móvil se va antes de que cargue", no "el LCP supera los 4 segundos".
No uses la palabra auditoría, ni informe, ni análisis. Suenan a factura.`,
    useWhen: 'Sectores donde el dueño toma decisiones con datos: clínicas, despachos, talleres, industria, servicios profesionales.',
    avoidWhen: 'Negocios muy pequeños o creativos, donde el tono de consultor suena a inspector.',
    targetWords: [60, 90],
  },
  {
    id: 'isra_bravo',
    kind: 'outbound',
    name: 'Directo con historia (estilo Isra Bravo)',
    summary: 'Una apertura que parece no venir a cuento, un giro, una verdad incómoda y la petición.',
    structure: '1) Una frase que descoloca y no habla de ellos ni de ti. 2) El giro que la conecta con su negocio. 3) La verdad incómoda, dicha sin rodeos. 4) La petición, en una línea. 5) P.D. con el detalle más específico de todos.',
    guidance: `Párrafos de una sola línea. Punto y aparte constante. El aire en la página es parte del mensaje.
Escribe de tú, a una persona, no a una empresa. Nunca "vosotros" corporativo si puedes evitarlo.
Prohibido "espero que estés bien", "te escribo porque", "permíteme presentarme" y cualquier fórmula de cortesía de oficina.
Cero adjetivos de venta. Si quitas un adjetivo y la frase sigue diciendo lo mismo, sobraba.
Puedes ser incómodo. No puedes ser listillo: la diferencia es que lo incómodo va sobre su negocio y lo listillo va sobre ti.
La P.D. es obligatoria en este estilo y lleva lo mejor que tengas, no un resumen.
Nada de listas ni de viñetas. Esto se lee como se lee un mensaje, no como se lee un documento.`,
    useWhen: 'Dueños que leen el correo en el móvil entre cosa y cosa. Sectores saturados de emails corporativos: hostelería, gimnasios, comercio, formación, estética.',
    avoidWhen: 'Cuando escribes a un comité o a un cargo intermedio que tiene que reenviarlo hacia arriba, y en sectores de trato muy formal donde el tono se lee como falta de respeto.',
    targetWords: [70, 110],
  },
  {
    id: 'pas',
    kind: 'outbound',
    name: 'Problema · agitación · solución',
    summary: 'El problema en una frase, lo que pasa si sigue igual, y qué harías tú.',
    structure: '1) El problema, sin adornos. 2) Lo que ya está pasando por su culpa, en presente. 3) Lo que se haría, en una frase. 4) La pregunta.',
    guidance: `La agitación es describir lo que ya ocurre, no profetizar catástrofes. "Cada búsqueda desde el móvil se pierde" es agitación; "podrías arruinarte" es alarmismo y se nota.
La solución va en una sola frase y sin detallar el cómo: el cómo es lo que se cuenta si contestan.
No repitas el problema al final. Se dijo una vez y basta.`,
    useWhen: 'El hallazgo tiene una consecuencia evidente y continua: formulario roto, web caída, ficha sin teléfono, reseñas sin responder.',
    avoidWhen: 'El hallazgo es menor o cosmético. Agitar algo pequeño destruye la credibilidad del resto del email.',
    targetWords: [70, 100],
  },
  {
    id: 'una_pregunta',
    kind: 'outbound',
    name: 'Una sola pregunta',
    summary: 'Tres líneas. Una observación específica y una pregunta. Nada más.',
    structure: '1) La observación, en una línea. 2) La pregunta. 3) La firma.',
    guidance: `Menos de 40 palabras en total. Si te pasas, no es este estilo: cambia de estrategia en vez de estirarlo.
Sin saludo largo, sin contexto, sin explicar quién eres. La brevedad es el mensaje: dice "no te voy a robar tiempo".
La observación tiene que entenderse sola, sin que haga falta explicarla. Si necesita contexto, esta estrategia no vale para este hallazgo.
Sin P.D.: una posdata en un email de tres líneas lo dobla y rompe el efecto.`,
    useWhen: 'Dueños muy ocupados y hallazgos que se explican solos. También como segundo intento cuando un email largo no obtuvo respuesta.',
    avoidWhen: 'El hallazgo necesita contexto para que se entienda, o el valor está en la conexión entre dos cosas.',
    targetWords: [20, 40],
  },
  {
    id: 'contraintuitivo',
    kind: 'outbound',
    name: 'Contraintuitivo',
    summary: 'Desmonta algo que su sector da por hecho y enseña dónde les está costando.',
    structure: '1) La creencia del sector, dicha como la dirían ellos. 2) Por qué en su caso concreto no se sostiene. 3) Qué se ve en su negocio. 4) La pregunta.',
    guidance: `La creencia que desmontas tiene que ser una que ellos tengan de verdad, no un muñeco de paja fácil de tumbar.
Necesitas un hecho verificado que sostenga la contradicción. Sin él esto es una opinión con tono de autoridad, y se huele.
No digas "la mayoría de los negocios se equivoca". Habla de este.
Termina bajando el tono: has contradicho a alguien, la pregunta final tiene que ser fácil de contestar sin darte la razón.`,
    useWhen: 'El negocio hace algo que todo el mundo en su sector hace y que en su caso concreto se puede ver que no le funciona.',
    avoidWhen: 'No tienes un hecho verificado que lo sostenga, o el destinatario es quien tomó esa decisión y la va a defender.',
    targetWords: [80, 110],
  },
  {
    id: 'caso_parecido',
    kind: 'outbound',
    name: 'Caso parecido',
    summary: 'Un negocio como el suyo, qué cambió, y la pregunta.',
    structure: '1) El caso, en dos líneas y sin nombre si no hay permiso. 2) Qué cambió exactamente. 3) Por qué te acuerdas de él al ver el suyo. 4) La pregunta.',
    guidance: `Solo puedes contar casos que estén en el material del remitente. Ni uno inventado, ni uno "típico del sector", ni cifras redondeadas hacia arriba.
Si el caso no lleva un número real, cuéntalo sin número: "dejaron de perder las llamadas de la tarde" vale más que un porcentaje inventado.
El puente entre el caso y ellos es lo que hace que funcione. Sin ese puente es un folleto.`,
    useWhen: 'Tienes un caso real y comparable en sector o tamaño, y el hallazgo del prospecto se parece al que resolviste.',
    avoidWhen: 'No hay caso real, el caso es de otro sector, o el prospecto es claramente más grande que el del caso.',
    targetWords: [80, 110],
    requiresCaseMaterial: true,
  },
]

// --- Más estilos de primer contacto ------------------------------------------

EMAIL_STRATEGIES.push(
  {
    id: 'carta_personal',
    kind: 'outbound',
    name: 'Carta personal (estilo Halbert)',
    summary: 'Escrito como una carta de una persona a otra, no como un email de empresa.',
    structure: '1) Se dirige a la persona por lo que hace, no por su cargo. 2) Cuenta por qué le escribe a él y no a otros cien. 3) Lo que ha visto. 4) La petición, casi disculpándose por molestar.',
    guidance: `Escribe como si estuvieras escribiendo a mano y solo pudieras mandar esta carta a una persona. Ese es el efecto que buscas.
Se permite —y conviene— una frase de por qué le escribes a él en concreto. Es lo único que justifica la molestia.
Frases medias, no telegráficas. Este estilo respira distinto que el directo: aquí el tono es cercano, no cortante.
Nada de "estimado" ni "atentamente". Tampoco de coleguismo forzado.
Puedes admitir lo obvio: que es un email no pedido. Reconocerlo desarma; fingir que no lo es, insulta.`,
    useWhen: 'Negocios familiares, oficios, profesionales que trabajan solos o con un equipo pequeño, donde detrás del correo hay una persona con nombre.',
    avoidWhen: 'Cadenas, franquicias o cualquier destinatario que sea un buzón genérico: la carta personal a info@ suena falsa.',
    targetWords: [90, 130],
  },
  {
    id: 'cadena_de_si',
    kind: 'outbound',
    name: 'Cadena de síes (estilo Sugarman)',
    summary: 'Cada frase existe para que se lea la siguiente. Empieza con algo que nadie discute.',
    structure: '1) Una afirmación que el lector acepta sin pensar. 2) Otra que también acepta y le acerca. 3) La que le incomoda. 4) La pregunta.',
    guidance: `La primera frase es cortísima y evidente. Su único trabajo es que se lea la segunda.
Encadena: cada frase tiene que hacer inevitable la siguiente. Si una se puede quitar sin romper la cadena, quítala.
Empieza por lo que el lector ya cree de su propio negocio, no por lo que tú quieres venderle.
Prohibido dar el salto antes de tiempo: si mencionas el problema en la primera frase, has roto la cadena.
Sin viñetas: una lista rompe la lectura seguida, que es todo el mecanismo.`,
    useWhen: 'Cuando el hallazgo es incómodo de oír de golpe y necesita que el lector llegue solo a la conclusión.',
    avoidWhen: 'Lectores con muy poco tiempo o hallazgos evidentes: encadenar lo obvio se lee como dar vueltas.',
    targetWords: [80, 120],
  },
  {
    id: 'dato_desnudo',
    kind: 'outbound',
    name: 'Dato desnudo (estilo Ogilvy)',
    summary: 'El hecho concreto, sin adjetivos, dejando que hable solo.',
    structure: '1) El dato, con su número o su detalle exacto. 2) Un segundo dato que lo enmarca. 3) Qué implica, en una frase. 4) La pregunta.',
    guidance: `Cero adjetivos y cero adverbios de intensidad. El dato pierde fuerza cada vez que lo calificas.
Los números van tal como salieron de la medición. Nada de redondear hacia arriba ni de convertir en porcentaje lo que se midió en unidades.
Si no tienes un dato concreto, esta estrategia no es la tuya: sin número es un email genérico con tono seco.
El asunto lleva el dato. Es lo que hace que se abra.`,
    useWhen: 'La auditoría dio una cifra concreta y comprobable: segundos de carga, reseñas sin responder, número de páginas sin título.',
    avoidWhen: 'Los hallazgos son cualitativos. Un dato desnudo que en realidad es una opinión es el peor de los mundos.',
    targetWords: [50, 80],
  },
)

// --- Seguimiento --------------------------------------------------------------

EMAIL_STRATEGIES.push(
  {
    id: 'recordatorio_corto',
    kind: 'followup',
    name: 'Recordatorio corto',
    summary: 'Dos líneas sobre el email anterior. Sin argumentos nuevos.',
    structure: '1) Una línea que retoma el hilo. 2) La pregunta, más fácil de contestar que la anterior.',
    guidance: `Menos de 30 palabras. Va sobre el email anterior, así que no hace falta volver a explicar nada.
Prohibido "solo quería asegurarme de que recibiste mi email" y "haciendo seguimiento": no dicen nada y suenan a plantilla de CRM.
Prohibido repetir el argumento del primero. Si no funcionó, repetirlo tampoco funciona.
Baja la petición: si antes preguntabas si querían verlo, ahora pregunta solo si es el momento.
Sin reproche, ni siquiera velado. "No he tenido respuesta" ya es un reproche.`,
    useWhen: 'Segundo contacto, pocos días después del primero, cuando el primero era bueno y probablemente no se llegó a leer.',
    avoidWhen: 'El primer email ya era muy corto: repetir brevedad sobre brevedad no aporta ningún ángulo nuevo.',
    targetWords: [15, 30],
  },
  {
    id: 'angulo_nuevo',
    kind: 'followup',
    name: 'Ángulo nuevo',
    summary: 'Otro hallazgo distinto, como si fuera la primera vez.',
    structure: '1) El hallazgo nuevo, directo. 2) Qué le cuesta. 3) La pregunta.',
    guidance: `Usa un hallazgo o un hecho que NO estuviera en los emails anteriores. Ese es el sentido de esta estrategia.
No menciones que ya escribiste. Este email se sostiene solo; si el anterior no se leyó, este no debe depender de él.
Si no queda ningún hallazgo sin usar, esta estrategia no vale: cámbiala por otra.`,
    useWhen: 'Hay más de un hallazgo real y el primero no obtuvo respuesta. Suele ser el que más responde de toda la secuencia.',
    avoidWhen: 'Solo había un hallazgo, o el nuevo es mucho más flojo que el ya usado.',
    targetWords: [50, 80],
  },
  {
    id: 'valor_suelto',
    kind: 'followup',
    name: 'Valor sin pedir nada',
    summary: 'Le das algo útil y no pides nada a cambio. Ni una pregunta.',
    structure: '1) Aquí tienes esto. 2) Por qué le sirve. 3) Punto. Sin petición.',
    guidance: `Este email NO lleva pregunta ni llamada a la acción. Ninguna. Es lo que lo hace funcionar.
Lo que das tiene que ser concreto y utilizable sin ti: cómo arreglar algo, qué mirar, dónde está el fallo exacto.
Da de verdad. Si lo que "das" es un adelanto que obliga a contestar para servir de algo, esto es una petición disfrazada y se nota.
Cierra sin abrir puertas: nada de "si quieres te cuento más".`,
    useWhen: 'Tercer o cuarto contacto. Rompe el patrón de todo lo que reciben y suele traer respuestas de quien ya te había descartado.',
    avoidWhen: 'No tienes nada concreto que regalar. Un consejo genérico como regalo es peor que no escribir.',
    targetWords: [50, 90],
  },
  {
    id: 'ruptura',
    kind: 'followup',
    name: 'Cierre del hilo',
    summary: 'Cierras tú. Sin drama, sin culpa, dejando la puerta abierta desde su lado.',
    structure: '1) Cierro el hilo. 2) Sin reproche: la razón es tuya, no suya. 3) Una salida fácil por si acaso.',
    guidance: `Cierras tú de verdad. Si el email dice que cierras y luego sigues escribiendo, has enseñado que no cumples lo que dices.
Nada de culpabilizar: ni "veo que no te interesa", ni "supongo que no es prioridad", ni "última oportunidad". La razón de cerrar es que no quieres seguir molestando.
Sin ofertas de última hora ni urgencias inventadas. Este email funciona precisamente porque no pide.
Deja una salida de una palabra por si el momento era el malo, no el mensaje.
Es el que más responde de toda la secuencia. No lo estropees intentando vender en él.`,
    useWhen: 'Último contacto de la secuencia, después de tres o cuatro intentos sin respuesta.',
    avoidWhen: 'Aún quedan intentos por hacer, o hubo alguna señal de interés: cerrar sobre un interés tibio lo mata.',
    targetWords: [30, 60],
  },
)

export function strategyById(id: string): EmailStrategy | undefined {
  return EMAIL_STRATEGIES.find(strategy => strategy.id === id)
}

/**
 * Las estrategias que se pueden ofrecer para este email.
 *
 * Dos filtros: el tipo de email (un cierre de hilo no vale como primer
 * contacto) y el material disponible. `caso_parecido` desaparece si el
 * remitente no tiene casos que contar — es la única puerta que impide que el
 * sistema prometa un resultado que nunca ocurrió.
 */
export function availableStrategies(hasCaseMaterial: boolean, kind: EmailKind = 'outbound'): EmailStrategy[] {
  return EMAIL_STRATEGIES.filter(strategy =>
    strategy.kind === kind && (!strategy.requiresCaseMaterial || hasCaseMaterial))
}

/**
 * La estrategia que toca en el intento número N, cuando nadie la ha elegido.
 * Es un orden de secuencia, no una preferencia: recordar, cambiar de ángulo,
 * regalar algo y cerrar. El último siempre cierra.
 */
export function followupPlanFor(attempt: number, remaining: number): string {
  if (remaining <= 1) return 'ruptura'
  const order = ['recordatorio_corto', 'angulo_nuevo', 'valor_suelto']
  return order[Math.min(Math.max(attempt, 1), order.length) - 1]
}

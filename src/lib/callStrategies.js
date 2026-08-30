export const CALL_STRATEGIES = [
  {
    id: 'permission_diagnosis',
    label: 'Permiso y diagnóstico',
    summary: 'Gana permiso, descubre el problema y acuerda un siguiente paso.',
    agentTypes: ['sales', 'qualification'], directions: ['outbound'], defaultFor: ['sales'],
    stages: [
      { label: 'Permiso', instruction: 'Explica el motivo en una frase y pide un momento.' },
      { label: 'Diagnóstico', instruction: 'Descubre problema, impacto y prioridad.' },
      { label: 'Evidencia', instruction: 'Conecta una prueba u oferta relevante.' },
      { label: 'Siguiente paso', instruction: 'Propón día, hora y responsable.' },
    ],
    expectedOutcome: 'Reunión con día y hora o un motivo claro para no continuar.',
  },
  {
    id: 'warm_reactivation',
    label: 'Reactivación cálida',
    summary: 'Retoma una conversación con contexto y una razón concreta.',
    agentTypes: ['sales', 'qualification', 'appointment'], directions: ['outbound'], defaultFor: [],
    stages: [
      { label: 'Contexto', instruction: 'Recuerda la última interacción real.' },
      { label: 'Motivo', instruction: 'Da una razón relevante para retomar ahora.' },
      { label: 'Actualización', instruction: 'Pregunta qué ha cambiado.' },
      { label: 'Reinicio', instruction: 'Acuerda la acción útil más pequeña.' },
    ],
    expectedOutcome: 'Siguiente paso reactivado, seguimiento fechado o cierre explícito.',
  },
  {
    id: 'objection_to_evidence',
    label: 'Objeción a evidencia',
    summary: 'Convierte una objeción en una pregunta y responde con pruebas.',
    agentTypes: ['sales', 'qualification', 'support'], directions: ['inbound', 'outbound'], defaultFor: [],
    stages: [
      { label: 'Reconocer', instruction: 'Demuestra que has entendido la preocupación.' },
      { label: 'Aclarar', instruction: 'Localiza el riesgo real con una pregunta.' },
      { label: 'Evidencia', instruction: 'Responde solo con información verificada.' },
      { label: 'Comprobar', instruction: 'Confirma si la duda quedó resuelta.' },
    ],
    expectedOutcome: 'Objeción resuelta, pregunta precisa para seguimiento o cierre respetuoso.',
  },
  {
    id: 'meeting_recovery',
    label: 'Recuperación de cita',
    summary: 'Recupera una reunión caída con dos alternativas concretas.',
    agentTypes: ['sales', 'appointment'], directions: ['outbound'], defaultFor: ['appointment'],
    stages: [
      { label: 'Referencia', instruction: 'Nombra la cita sin culpabilizar.' },
      { label: 'Vigencia', instruction: 'Confirma si el tema sigue siendo relevante.' },
      { label: 'Alternativas', instruction: 'Ofrece exactamente dos horarios.' },
      { label: 'Confirmación', instruction: 'Repite día, hora y siguiente acción.' },
    ],
    expectedOutcome: 'Reunión reprogramada con día y hora.',
  },
  {
    id: 'fast_qualification',
    label: 'Cualificación rápida',
    summary: 'Valida encaje, urgencia y decisión sin alargar la llamada.',
    agentTypes: ['qualification', 'sales'], directions: ['inbound', 'outbound'], defaultFor: ['qualification'],
    stages: [
      { label: 'Situación', instruction: 'Entiende el proceso o problema actual.' },
      { label: 'Encaje', instruction: 'Valida escala, caso de uso y requisitos.' },
      { label: 'Urgencia', instruction: 'Detecta prioridad y coste de esperar.' },
      { label: 'Decisión', instruction: 'Confirma decisores y siguiente paso.' },
    ],
    expectedOutcome: 'Reunión cualificada o motivo de descarte documentado.',
  },
  {
    id: 'inbound_triage',
    label: 'Triaje entrante',
    summary: 'Entiende la urgencia, resuelve lo simple y deriva con contexto.',
    agentTypes: ['receptionist', 'support', 'handoff'], directions: ['inbound'], defaultFor: ['receptionist', 'support', 'handoff'],
    stages: [
      { label: 'Escuchar', instruction: 'Deja explicar la necesidad antes de acotarla.' },
      { label: 'Clasificar', instruction: 'Identifica intención, urgencia y responsable.' },
      { label: 'Resolver', instruction: 'Responde solo desde fuentes verificadas.' },
      { label: 'Derivar', instruction: 'Transfiere una sola vez con contexto completo.' },
    ],
    expectedOutcome: 'Resuelto en llamada o derivado una vez con todo el contexto.',
  },
  {
    id: 'renewal_value',
    label: 'Renovación por valor',
    summary: 'Revisa resultados, detecta riesgo y acuerda la renovación.',
    agentTypes: ['sales', 'collections', 'support'], directions: ['outbound'], defaultFor: [],
    stages: [
      { label: 'Resultado', instruction: 'Pregunta qué valor han obtenido realmente.' },
      { label: 'Riesgo', instruction: 'Saca a la luz fricción o baja adopción.' },
      { label: 'Encaje', instruction: 'Conecta el próximo periodo con necesidades reales.' },
      { label: 'Compromiso', instruction: 'Acuerda renovación, recuperación o decisión.' },
    ],
    expectedOutcome: 'Renovación, plan de recuperación o riesgo con responsable y fecha.',
  },
  {
    id: 'payment_commitment',
    label: 'Compromiso de pago',
    summary: 'Aclara el retraso y acuerda una fecha de pago verificable.',
    agentTypes: ['collections'], directions: ['outbound'], defaultFor: ['collections'],
    stages: [
      { label: 'Identidad', instruction: 'Verifica a la persona antes de hablar de pagos.' },
      { label: 'Hecho', instruction: 'Expón importe y vencimiento de forma neutral.' },
      { label: 'Motivo', instruction: 'Entiende qué impide el pago.' },
      { label: 'Compromiso', instruction: 'Acuerda y repite una fecha realista.' },
    ],
    expectedOutcome: 'Fecha de pago concreta o incidencia documentada para seguimiento.',
  },
]

export function strategiesForAgent(agentType, callDirection = 'both') {
  const compatible = CALL_STRATEGIES.filter(strategy => {
    const typeMatches = strategy.agentTypes.includes(agentType)
    const directionMatches = callDirection === 'both' || strategy.directions.includes(callDirection)
    return typeMatches && directionMatches
  })
  return compatible.length ? compatible : CALL_STRATEGIES.filter(strategy => strategy.agentTypes.includes(agentType))
}

export function strategyForAgent(strategyId, agentType = 'sales', callDirection = 'both') {
  const compatible = strategiesForAgent(agentType, callDirection)
  const requested = compatible.find(strategy => strategy.id === strategyId)
  return requested
    ?? compatible.find(strategy => strategy.defaultFor.includes(agentType))
    ?? compatible[0]
    ?? CALL_STRATEGIES[0]
}

export function callStrategyById(strategyId) {
  return CALL_STRATEGIES.find(strategy => strategy.id === strategyId) ?? null
}

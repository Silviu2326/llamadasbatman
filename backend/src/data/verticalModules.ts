/**
 * Biblioteca de módulos verticales — `docs/xarly/organico.md` §4.5.
 *
 * La idea que sostiene todo el onboarding: **cada módulo es datos, no código**.
 * Añadir el sector "clínicas" debe ser escribir un objeto aquí, no tocar
 * servicios ni pantallas. Por eso el componente de onboarding no conoce ningún
 * sector: recibe las preguntas del backend y las pinta.
 *
 * Así no se construye una plataforma "para pádel": se construye una universal
 * que se convierte en herramienta de pádel cuando entra un club y en
 * herramienta inmobiliaria cuando entra una agencia.
 *
 * Los dos primeros son los que persigue el producto de verdad: `gimnasio` tiene
 * su `AdPlaybook` sembrado en `prisma/seed.ts` y "clínicas y salud" aparece en
 * el wizard de Ads. La §11 pide "dos sectores con clientes reales", y esa es la
 * mejor evidencia que hay en el repositorio.
 *
 * Deporte e inmobiliaria se conservan porque son los ejemplos que el propio
 * documento desarrolla en detalle (§4.3 y §4.10): sirven de plantilla para
 * escribir los siguientes. El resto de la biblioteca —restauración, academias,
 * ecommerce, automoción, seguros, legal, hostelería, software— crece añadiendo
 * entradas a este array.
 */

export type VerticalQuestion = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'multiselect' | 'select' | 'boolean'
  options?: string[]
  help?: string
  /** Preguntas que, sin respuesta, impiden activar el sistema. */
  required?: boolean
}

export type VerticalEvent = {
  key: string
  label: string
  /** Qué formatos tiene sentido generar cuando ocurre. */
  suggestedFormats: string[]
  suggestedTimings: string[]
  /**
   * `auto` solo donde el dato es confirmado y el formato ya está aprobado
   * (§9). Todo lo demás pasa por la sala de aprobación.
   */
  defaultApproval: 'auto' | 'approval' | 'always_approval'
  sensitive?: boolean
}

export type VerticalModule = {
  key: string
  label: string
  /** Palabras que delatan el sector al leer la web del negocio. */
  vocabulary: string[]
  /** Fuentes de datos habituales del sector, para la pantalla de fuentes. */
  suggestedSources: string[]
  questionGroups: Array<{ title: string; questions: VerticalQuestion[] }>
  events: VerticalEvent[]
  channels: string[]
}

const SPORT: VerticalModule = {
  key: 'deporte',
  label: 'Deporte y competiciones',
  vocabulary: [
    'partido', 'partidos', 'jornada', 'liga', 'clasificación', 'clasificacion',
    'torneo', 'competición', 'competicion', 'club', 'clubes', 'jugador',
    'jugadores', 'equipo', 'equipos', 'temporada', 'pádel', 'padel', 'pista',
    'ranking', 'marcador', 'resultado', 'entrenador', 'federación', 'federacion',
  ],
  suggestedSources: [
    'API de resultados', 'Calendario de competición', 'Hoja de clasificación',
    'Inscripciones de jugadores',
  ],
  questionGroups: [
    {
      title: 'Competiciones',
      questions: [
        { key: 'competitions', label: '¿Qué competiciones quieres cubrir?', type: 'textarea', required: true },
        { key: 'clubs', label: '¿Qué clubes participan?', type: 'textarea' },
        { key: 'divisions', label: '¿Hay divisiones o categorías?', type: 'text' },
        { key: 'calendarSource', label: '¿Dónde se encuentra el calendario?', type: 'text' },
        { key: 'resultsConfirmedBy', label: '¿Quién confirma los resultados?', type: 'text', help: 'Determina si el marcador se puede publicar sin aprobación.' },
      ],
    },
    {
      title: 'Datos deportivos',
      questions: [
        { key: 'matchesStorage', label: '¿Dónde se guardan los partidos?', type: 'text' },
        { key: 'hasApi', label: '¿Existe una API?', type: 'boolean' },
        { key: 'liveResults', label: '¿Disponéis de resultados en directo?', type: 'boolean' },
        { key: 'autoStandings', label: '¿Hay clasificación automática?', type: 'boolean' },
        {
          key: 'playerMediaConsent',
          label: '¿Podemos utilizar nombres y fotografías de jugadores?',
          type: 'boolean',
          // §8: sin este permiso declarado, ninguna pieza publica nombres ni
          // fotos de personas. No es una preferencia, es la base jurídica.
          help: 'Sin este permiso, Xarly no publicará nombres ni fotos de personas.',
          required: true,
        },
      ],
    },
  ],
  events: [
    { key: 'match_scheduled', label: 'Partido programado', suggestedFormats: ['post', 'story'], suggestedTimings: ['7d_before', '24h_before', '1h_before'], defaultApproval: 'approval' },
    { key: 'match_finished', label: 'Partido finalizado', suggestedFormats: ['post', 'story'], suggestedTimings: ['on_end'], defaultApproval: 'auto' },
    { key: 'standings_updated', label: 'Clasificación actualizada', suggestedFormats: ['carrusel'], suggestedTimings: ['next_day'], defaultApproval: 'auto' },
    { key: 'matchday_end', label: 'Fin de jornada', suggestedFormats: ['carrusel', 'post'], suggestedTimings: ['weekly'], defaultApproval: 'approval' },
    { key: 'player_of_week', label: 'Jugador de la jornada', suggestedFormats: ['post'], suggestedTimings: ['weekly'], defaultApproval: 'approval' },
    { key: 'record_anniversary', label: 'Récord o aniversario', suggestedFormats: ['post'], suggestedTimings: ['on_end'], defaultApproval: 'approval' },
  ],
  channels: ['instagram', 'facebook', 'tiktok', 'x', 'linkedin', 'whatsapp', 'email', 'web'],
}

const REAL_ESTATE: VerticalModule = {
  key: 'inmobiliaria',
  label: 'Inmobiliaria',
  vocabulary: [
    'vivienda', 'viviendas', 'piso', 'pisos', 'chalet', 'inmueble', 'inmuebles',
    'alquiler', 'venta', 'hipoteca', 'hipotecas', 'promoción', 'promocion',
    'obra nueva', 'inmobiliaria', 'propietario', 'comprador', 'tasación',
    'tasacion', 'metro cuadrado', 'reserva', 'captación', 'captacion', 'catastro',
  ],
  suggestedSources: [
    'CRM inmobiliario', 'Portal de inmuebles', 'BOE', 'Diario oficial autonómico',
    'Ayuntamiento', 'INE', 'Datos hipotecarios',
  ],
  questionGroups: [
    {
      title: 'Zona y mercado',
      questions: [
        { key: 'municipalities', label: 'Municipios donde trabajáis', type: 'textarea', required: true },
        { key: 'propertyTypes', label: 'Tipo de vivienda', type: 'multiselect', options: ['Piso', 'Chalet', 'Ático', 'Obra nueva', 'Local', 'Suelo'] },
        { key: 'operation', label: '¿Venta, alquiler o ambos?', type: 'select', options: ['Venta', 'Alquiler', 'Ambos'], required: true },
        { key: 'buyerProfile', label: 'Perfil de comprador', type: 'text' },
        { key: 'ownerProfile', label: 'Perfil de propietario', type: 'text' },
        { key: 'priceRange', label: 'Rango de precios', type: 'text' },
      ],
    },
    {
      title: 'Fuentes internas y externas',
      questions: [
        { key: 'crm', label: '¿Qué CRM inmobiliario usáis?', type: 'text' },
        { key: 'portals', label: '¿En qué portales publicáis?', type: 'text' },
        { key: 'externalSources', label: '¿Qué fuentes externas queréis vigilar?', type: 'multiselect', options: ['BOE', 'Diario autonómico', 'Ayuntamiento', 'INE', 'Banco de España', 'Noticias del sector'] },
      ],
    },
  ],
  events: [
    { key: 'listing_published', label: 'Nueva vivienda', suggestedFormats: ['post', 'carrusel'], suggestedTimings: ['on_end'], defaultApproval: 'auto' },
    { key: 'price_drop', label: 'Bajada de precio', suggestedFormats: ['post', 'story'], suggestedTimings: ['on_end'], defaultApproval: 'approval' },
    { key: 'listing_reserved', label: 'Vivienda reservada', suggestedFormats: ['story'], suggestedTimings: ['on_end'], defaultApproval: 'approval' },
    { key: 'listing_sold', label: 'Vivienda vendida', suggestedFormats: ['post'], suggestedTimings: ['on_end'], defaultApproval: 'approval' },
    { key: 'mortgage_change', label: 'Cambio hipotecario', suggestedFormats: ['carrusel', 'articulo'], suggestedTimings: ['next_day'], defaultApproval: 'always_approval', sensitive: true },
    { key: 'new_subsidy', label: 'Nueva ayuda de vivienda', suggestedFormats: ['carrusel', 'email', 'landing'], suggestedTimings: ['next_day'], defaultApproval: 'always_approval', sensitive: true },
    { key: 'tax_change', label: 'Cambio fiscal', suggestedFormats: ['articulo'], suggestedTimings: ['next_day'], defaultApproval: 'always_approval', sensitive: true },
    { key: 'faq_detected', label: 'Pregunta frecuente detectada', suggestedFormats: ['carrusel', 'post'], suggestedTimings: ['weekly'], defaultApproval: 'approval' },
  ],
  channels: ['instagram', 'facebook', 'linkedin', 'whatsapp', 'email', 'web'],
}

/**
 * Gimnasios. Esta en la biblioteca del §4.5 y ademas es uno de los verticales
 * que el producto ya persigue: `prisma/seed.ts` siembra su `AdPlaybook`.
 */
const GYM: VerticalModule = {
  key: 'gimnasio',
  label: 'Gimnasios y centros deportivos',
  vocabulary: [
    'gimnasio', 'entrenamiento', 'entrenador', 'entrenadora', 'clase dirigida',
    'musculacion', 'cardio', 'crossfit', 'spinning', 'yoga', 'pilates',
    'cuota', 'socio', 'socios', 'matricula', 'rutina', 'sala fitness',
    'monitor', 'abono',
  ],
  suggestedSources: ['Software de gestion de socios', 'Calendario de clases', 'Control de accesos'],
  questionGroups: [
    {
      title: 'Centro y oferta',
      questions: [
        { key: 'services', label: '¿Qué servicios ofrecéis?', type: 'multiselect', options: ['Sala de musculación', 'Clases dirigidas', 'Entrenamiento personal', 'Piscina', 'Nutrición', 'Fisioterapia'], required: true },
        { key: 'schedule', label: '¿Dónde está el horario de clases?', type: 'text' },
        { key: 'membershipTypes', label: 'Tipos de cuota', type: 'text' },
        { key: 'peakMonths', label: '¿Qué meses son los fuertes de captación?', type: 'text', help: 'Enero y septiembre suelen concentrar las altas: el calendario de contenido se adapta.' },
      ],
    },
    {
      title: 'Personas y permisos',
      questions: [
        { key: 'memberMediaConsent', label: '¿Podéis publicar fotos o vídeos de socios entrenando?', type: 'boolean', help: 'Sin este permiso, ninguna pieza publicará imágenes de personas identificables.', required: true },
        { key: 'trainerSpotlight', label: '¿Queréis dar protagonismo a los entrenadores?', type: 'boolean' },
      ],
    },
  ],
  events: [
    { key: 'class_schedule_published', label: 'Horario de clases publicado', suggestedFormats: ['post', 'story'], suggestedTimings: ['weekly'], defaultApproval: 'auto' },
    { key: 'new_class', label: 'Clase o actividad nueva', suggestedFormats: ['post', 'carrusel'], suggestedTimings: ['7d_before', '24h_before'], defaultApproval: 'approval' },
    { key: 'promo_period', label: 'Campaña de altas', suggestedFormats: ['carrusel', 'landing'], suggestedTimings: ['on_start'], defaultApproval: 'always_approval', sensitive: true },
    { key: 'member_milestone', label: 'Logro de un socio', suggestedFormats: ['post', 'story'], suggestedTimings: ['on_end'], defaultApproval: 'approval' },
    { key: 'trainer_tip', label: 'Consejo del entrenador', suggestedFormats: ['post', 'reel_script'], suggestedTimings: ['weekly'], defaultApproval: 'approval' },
  ],
  channels: ['instagram', 'facebook', 'tiktok', 'whatsapp', 'email', 'web'],
}

/**
 * Clínicas y salud. Además de estar en la biblioteca y en el wizard de Ads, es
 * el vertical que ejercita de verdad el guardarraíl de contenido sensible del
 * §8: en salud casi todo lo publicable roza una afirmación clínica, así que
 * ningún acontecimiento sale en automático por muy aprobado que esté el
 * formato.
 */
const CLINIC: VerticalModule = {
  key: 'clinica',
  label: 'Clínicas y salud',
  vocabulary: [
    'clinica', 'clínica', 'paciente', 'pacientes', 'consulta', 'tratamiento',
    'tratamientos', 'diagnostico', 'diagnóstico', 'cita previa', 'doctor',
    'doctora', 'especialista', 'odontologia', 'dentista', 'fisioterapia',
    'dermatologia', 'revision', 'colegiado', 'sanitario',
  ],
  suggestedSources: ['Software de citas', 'Historia clínica', 'Agenda de especialistas'],
  questionGroups: [
    {
      title: 'Especialidad y equipo',
      questions: [
        { key: 'specialties', label: '¿Qué especialidades ofrecéis?', type: 'textarea', required: true },
        { key: 'practitioners', label: '¿Qué profesionales queréis dar a conocer?', type: 'text' },
        { key: 'appointmentSystem', label: '¿Con qué sistema gestionáis las citas?', type: 'text' },
      ],
    },
    {
      title: 'Cumplimiento',
      questions: [
        { key: 'medicalReviewer', label: '¿Quién revisa el contenido antes de publicarlo?', type: 'text', help: 'El contenido sanitario siempre pasa por revisión: hace falta un responsable con criterio clínico.', required: true },
        { key: 'patientMediaConsent', label: '¿Tenéis consentimiento firmado para usar casos de pacientes?', type: 'boolean', help: 'Sin consentimiento firmado, ninguna pieza mencionará casos ni mostrará imágenes de pacientes.', required: true },
      ],
    },
  ],
  // En salud no hay `auto`: cualquier pieza puede leerse como consejo médico.
  events: [
    { key: 'faq_detected', label: 'Duda frecuente de pacientes', suggestedFormats: ['carrusel', 'post'], suggestedTimings: ['weekly'], defaultApproval: 'always_approval', sensitive: true },
    { key: 'treatment_explainer', label: 'Explicación de un tratamiento', suggestedFormats: ['articulo', 'carrusel'], suggestedTimings: ['next_day'], defaultApproval: 'always_approval', sensitive: true },
    { key: 'prevention_campaign', label: 'Campaña de prevención', suggestedFormats: ['post', 'landing'], suggestedTimings: ['on_start'], defaultApproval: 'always_approval', sensitive: true },
    { key: 'new_service', label: 'Servicio o especialidad nueva', suggestedFormats: ['post', 'landing'], suggestedTimings: ['on_end'], defaultApproval: 'always_approval', sensitive: true },
    { key: 'team_introduction', label: 'Presentación de un profesional', suggestedFormats: ['post'], suggestedTimings: ['on_end'], defaultApproval: 'approval' },
  ],
  channels: ['instagram', 'facebook', 'linkedin', 'whatsapp', 'email', 'web'],
}

export const VERTICAL_MODULES: VerticalModule[] = [GYM, CLINIC, SPORT, REAL_ESTATE]

export function getModule(key: string): VerticalModule | null {
  return VERTICAL_MODULES.find(module => module.key === key) ?? null
}

/**
 * Detecta sectores puntuando el texto de la web contra el vocabulario de cada
 * módulo. Es una heurística explicable a propósito: la confianza sale de
 * términos concretos encontrados, así que se puede enseñar *por qué* se dedujo
 * un sector. Un LLM daría un número sin justificación auditable.
 */
export function detectSectors(text: string): Array<{ key: string; label: string; confidence: number; matched: string[] }> {
  const haystack = text.toLowerCase()
  return VERTICAL_MODULES.map(module => {
    const matched = module.vocabulary.filter(term => haystack.includes(term))
    // Saturación a los 8 términos: encontrar 20 no da más certeza que 8, y sin
    // el tope una web larga puntuaría alto en cualquier sector.
    const confidence = Math.min(0.95, Math.round((matched.length / 8) * 100) / 100)
    return { key: module.key, label: module.label, confidence, matched: matched.slice(0, 8) }
  })
    .filter(result => result.matched.length > 0)
    .sort((left, right) => right.confidence - left.confidence)
}

import {
  RiApps2Line,
  RiBook2Line,
  RiFlowChart,
  RiRocket2Line,
  RiSettings4Line,
  RiSparkling2Line,
  RiToolsLine,
} from 'react-icons/ri'

export const TUTORIALS = [
  {
    id: 'first-steps',
    eyebrow: 'Para empezar',
    title: 'Tu primer día en Vendrava',
    description: 'Configura tu espacio, entiende la navegación y encuentra las acciones que más impacto tienen para tu equipo.',
    duration: '12 min',
    level: 'Principiante',
    Icon: RiRocket2Line,
    color: '#67e8f9',
    steps: ['Conoce los espacios y la navegación local', 'Revisa el perfil de empresa', 'Encuentra tu primera acción prioritaria'],
  },
  {
    id: 'microapps',
    eyebrow: 'Capacidades',
    title: 'Trabajar con microapps',
    description: 'Aprende a elegir una habilidad, preparar sus entradas y leer resultados con evidencia y coste trazable.',
    duration: '18 min',
    level: 'Intermedio',
    Icon: RiApps2Line,
    color: '#a78bfa',
    steps: ['Busca una microapp por objetivo', 'Completa las entradas y estima el coste', 'Guarda y reutiliza el resultado'],
  },
  {
    id: 'flows',
    eyebrow: 'Automatización',
    title: 'Construir tu primer Flow',
    description: 'Combina capacidades en una receta repetible con aprobaciones, límites y un historial de ejecución claro.',
    duration: '24 min',
    level: 'Intermedio',
    Icon: RiFlowChart,
    color: '#f0abfc',
    steps: ['Define el objetivo y las variables', 'Añade capacidades y condiciones', 'Valida el dry-run y publica'],
  },
  {
    id: 'voice-agent',
    eyebrow: 'Conversación',
    title: 'Preparar un agente de voz',
    description: 'Crea una experiencia de llamada que suene humana, respete tus reglas y convierta conversaciones en acciones.',
    duration: '21 min',
    level: 'Intermedio',
    Icon: RiSparkling2Line,
    color: '#fb7185',
    steps: ['Escribe el objetivo de la conversación', 'Ajusta tono, límites y transferencia', 'Prueba el agente antes de activarlo'],
  },
]

export const DOC_CATEGORIES = ['Todo', 'Primeros pasos', 'Operación', 'Integraciones', 'Referencia']

export const DOCUMENTS = [
  { id: 'workspace', category: 'Primeros pasos', title: 'Configurar tu espacio de trabajo', description: 'Organizaciones, permisos, idioma, tema y preferencias que afectan a todo el equipo.', readTime: '6 min', Icon: RiSettings4Line, accent: '#67e8f9', body: 'Empieza revisando la información de empresa y los permisos de tu organización. Así cada persona verá las áreas que necesita y las ejecuciones quedarán ligadas al contexto correcto.' },
  { id: 'microapps-reference', category: 'Referencia', title: 'Referencia de MicroappManifest', description: 'Entradas, efectos, evidencias, permisos de datos y estados de una microapp.', readTime: '9 min', Icon: RiApps2Line, accent: '#a78bfa', body: 'Una microapp es una receta especializada sobre la plataforma común. Su manifiesto declara qué necesita, qué devuelve y qué controles deben cumplirse antes de ejecutarla.' },
  { id: 'flows-guide', category: 'Operación', title: 'Flows: de objetivo a ejecución', description: 'Cómo diseñar, validar, publicar y auditar una receta de trabajo.', readTime: '11 min', Icon: RiFlowChart, accent: '#f0abfc', body: 'Los Flows convierten una intención en una secuencia gobernada. Usa dry-run para verificar variables, presupuesto y dependencias antes de ejecutar acciones reales.' },
  { id: 'connections', category: 'Integraciones', title: 'Conectar proveedores y cuentas', description: 'BYOK, conectores, capacidades disponibles y resolución de credenciales.', readTime: '7 min', Icon: RiToolsLine, accent: '#34d399', body: 'Las conexiones se gestionan desde un único centro. Cada proveedor expone sus capacidades y la plataforma decide qué ruta es válida para cada ejecución.' },
  { id: 'voice-safety', category: 'Operación', title: 'Buenas prácticas para agentes de voz', description: 'Consentimiento, horarios, transferencia humana y revisión de calidad.', readTime: '8 min', Icon: RiSparkling2Line, accent: '#fb7185', body: 'Diseña cada llamada con un objetivo acotado, una salida clara y una vía de transferencia. Revisa siempre consentimiento, horarios y trazabilidad antes de publicar.' },
  { id: 'api-webhooks', category: 'Referencia', title: 'API y webhooks', description: 'Autenticación, eventos, idempotencia y contratos para integrar Vendrava.', readTime: '14 min', Icon: RiBook2Line, accent: '#60a5fa', body: 'La API permite descubrir capacidades, estimar ejecuciones y consultar resultados. Los webhooks notifican cambios de estado sin tener que sondear cada trabajo.' },
]

import { studioConfigSchema, studioReplySchema, DEFAULT_STUDIO, type PersonalStudioConfig } from './personalStudioConfig'

const block = (id: string, type: string, title: string, description: string, content = '') => ({ id, type, title, description, content, items: [] })
export const STUDIO_PRESETS = [
  { id: 'podcast', title: 'Pódcast', subtitle: 'Dale voz a tus ideas', config: studioConfigSchema.parse({
    ...DEFAULT_STUDIO, preset: 'podcast', name: 'Estudio de pódcast', description: 'De la primera idea al episodio listo para compartir.', tools: ['video-editor', 'zip-export'],
    blocks: [
      block('brief', 'brief', 'Brief del episodio', 'Tema, audiencia y el mensaje que quieres dejar.', 'Tema:\n\n¿A quién va dirigido?\n\n¿Qué se lleva quien escucha?\n\nInvitado y duración:'),
      block('guion', 'text', 'Guion del episodio', 'Escribe, edita y dale forma a tu episodio.', 'APERTURA\nUna pregunta o historia para abrir.\n\nCONVERSACIÓN\n1. Contexto\n2. Ideas principales\n3. Ejemplos e historias\n\nCIERRE\nLa idea que merece quedarse.'),
      block('edicion', 'video-editor', 'Edición', 'Recorta tu vídeo y prepara fragmentos del episodio.'),
      block('entrega', 'zip-export', 'Entrega', 'Reúne el episodio, el guion y sus materiales en un ZIP.'),
    ],
  }) },
  { id: 'free-values', title: 'Free Values', subtitle: 'Ideas que aportan valor', config: studioConfigSchema.parse({
    ...DEFAULT_STUDIO, preset: 'free-values', accent: 'emerald', name: 'Estudio Free Values', description: 'Convierte lo que sabes en contenido que merece guardarse.', tools: ['zip-export'],
    blocks: [
      block('enfoque', 'brief', 'Enfoque y audiencia', 'Define a quién ayudas y qué problema resuelves.', 'Mi audiencia:\n\nSu problema concreto:\n\nLo que podrá hacer después:'),
      block('recurso', 'text', 'Recurso de valor', 'Da forma a una guía, una plantilla o un guion.', 'TÍTULO\n\nLA PROMESA\n\nPASO A PASO\n1.\n2.\n3.\n\nEJEMPLO PRÁCTICO\n\nSIGUIENTE PASO'),
      { ...block('revision', 'checklist', 'Revisión', 'Comprueba que tu recurso está listo para compartir.'), items: [
        { id: 'util', text: 'Resuelve un problema concreto', done: false }, { id: 'ejemplo', text: 'Incluye un ejemplo aplicable', done: false }, { id: 'claro', text: 'Se entiende sin contexto adicional', done: false },
      ] },
      block('entrega', 'zip-export', 'Entrega', 'Empaqueta tus recursos descargables.'),
    ],
  }) },
  { id: 'custom', title: 'A tu medida', subtitle: 'Cuéntanos tu idea', config: studioConfigSchema.parse({
    ...DEFAULT_STUDIO, name: 'Mi estudio a medida', description: 'Un espacio que toma la forma de tus ideas.',
    blocks: [block('idea', 'brief', 'Tu idea', 'El punto de partida. Nara construirá contigo desde aquí.', '')],
  }) },
]

export function describeStudioChanges(previous: PersonalStudioConfig, next: PersonalStudioConfig): string[] {
  const changes: string[] = []
  for (const block of next.blocks) {
    const old = previous.blocks.find(item => item.id === block.id)
    if (!old) changes.push(`Añadido: ${block.title}`)
    else if (JSON.stringify(old) !== JSON.stringify(block)) changes.push(`Actualizado: ${block.title}`)
  }
  for (const old of previous.blocks) if (!next.blocks.some(block => block.id === old.id)) changes.push(`Retirado: ${old.title}`)
  if (previous.blocks.map(b => b.id).join() !== next.blocks.map(b => b.id).join() && !changes.length) changes.push('Recorrido reorganizado')
  if (previous.name !== next.name) changes.push(`Nombre: ${next.name}`)
  if (previous.accent !== next.accent || previous.layout !== next.layout || previous.density !== next.density) changes.push('Estilo del espacio actualizado')
  return changes.slice(0, 16)
}

// Model output is a declarative blueprint, never executable HTML or JavaScript.
// Compilation reconciles legacy tools with the actual renderable block registry.
export function compileStudioBlueprint(output: unknown, previous: PersonalStudioConfig) {
  const parsed = studioReplySchema.parse(output)
  const tools = [...new Set([...parsed.config.tools, ...parsed.config.blocks.flatMap(block =>
    block.type === 'video-editor' || block.type === 'zip-export' || block.type === 'providers' ? [block.type] : [])])]
  const config = studioConfigSchema.parse({ ...parsed.config, tools })
  return { message: parsed.message, config, changes: describeStudioChanges(previous, config) }
}

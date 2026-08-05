// Renderizador Markdown mínimo para los artículos SEO generados por la IA:
// cabeceras, negrita, cursiva, listas, enlaces y párrafos. Sin dependencias.
// ponytail: si algún día se edita Markdown arbitrario a mano, cambiar por
// una librería real (react-markdown).

function renderInline(text, keyPrefix) {
  const parts = []
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g
  let last = 0
  let match
  let i = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1] != null) parts.push(<strong key={`${keyPrefix}-b${i}`}>{match[1]}</strong>)
    else if (match[2] != null) parts.push(<em key={`${keyPrefix}-i${i}`}>{match[2]}</em>)
    else parts.push(<a key={`${keyPrefix}-a${i}`} href={match[4]} target="_blank" rel="noreferrer">{match[3]}</a>)
    last = match.index + match[0].length
    i += 1
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function renderMarkdown(markdown) {
  if (!markdown) return null
  const blocks = markdown.replace(/\r\n/g, '\n').split(/\n{2,}/)
  return blocks.map((block, index) => {
    const trimmed = block.trim()
    if (!trimmed) return null
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/)
    if (heading && !trimmed.includes('\n')) {
      const Tag = `h${Math.min(heading[1].length + 1, 5)}`
      return <Tag key={index}>{renderInline(heading[2], index)}</Tag>
    }
    const lines = trimmed.split('\n')
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      return (
        <ul key={index}>
          {lines.map((line, li) => <li key={li}>{renderInline(line.replace(/^\s*[-*]\s+/, ''), `${index}-${li}`)}</li>)}
        </ul>
      )
    }
    if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
      return (
        <ol key={index}>
          {lines.map((line, li) => <li key={li}>{renderInline(line.replace(/^\s*\d+[.)]\s+/, ''), `${index}-${li}`)}</li>)}
        </ol>
      )
    }
    return <p key={index}>{renderInline(trimmed, index)}</p>
  })
}

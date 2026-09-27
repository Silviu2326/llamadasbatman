function safeLink(value) {
  try {
    const url = new URL(value, window.location.origin)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

function inline(text, key = 'inline') {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\))/g
  return text.split(pattern).filter(Boolean).map((part, index) => {
    const keyName = `${key}-${index}`
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) return <strong key={keyName}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={keyName}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={keyName}>{part.slice(1, -1)}</em>
    if (part.startsWith('_') && part.endsWith('_')) return <em key={keyName}>{part.slice(1, -1)}</em>
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const href = safeLink(link[2].trim())
      return href ? <a key={keyName} href={href} target="_blank" rel="noreferrer">{link[1]}</a> : link[1]
    }
    return part
  })
}

function isList(line) { return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line) }
function isTableRule(line) { return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line) }
function cells(line) { return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()) }

export default function AssistantMarkdown({ content }) {
  const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let paragraph = [], list = null, code = null, quote = []
  const flushParagraph = () => {
    if (!paragraph.length) return
    const text = paragraph.join(' ').trim()
    if (text) {
      const title = text.match(/^(?:\*\*|__)(.{1,90})(?:\*\*|__)$/)
      blocks.push(title
        ? <h3 key={`b-${blocks.length}`}>{title[1]}</h3>
        : <p key={`b-${blocks.length}`}>{inline(text, `p-${blocks.length}`)}</p>)
    }
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={`b-${blocks.length}`}>{list.items.map((item, i) => <li key={i}>{inline(item, `li-${blocks.length}-${i}`)}</li>)}</Tag>)
    list = null
  }
  const flushQuote = () => {
    if (!quote.length) return
    blocks.push(<blockquote key={`b-${blocks.length}`}>{quote.map((line, i) => <p key={i}>{inline(line, `q-${blocks.length}-${i}`)}</p>)}</blockquote>)
    quote = []
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (code) {
      if (/^\s*```/.test(line)) { blocks.push(<pre key={`b-${blocks.length}`}><code>{code.lines.join('\n')}</code></pre>); code = null }
      else code.lines.push(line)
      continue
    }
    if (/^\s*```/.test(line)) { flushParagraph(); flushList(); flushQuote(); code = { lines: [] }; continue }
    if (i + 1 < lines.length && line.includes('|') && isTableRule(lines[i + 1])) {
      flushParagraph(); flushList(); flushQuote()
      const headers = cells(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) { rows.push(cells(lines[i])); i += 1 }
      i -= 1
      blocks.push(<div className="assistant-markdown-table-wrap" key={`b-${blocks.length}`}><table><thead><tr>{headers.map((cell, j) => <th key={j}>{inline(cell, `th-${j}`)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] || '', `td-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>)
      continue
    }
    if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); continue }
    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) { flushParagraph(); flushList(); flushQuote(); blocks.push(<hr key={`b-${blocks.length}`} />); continue }
    const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      flushParagraph(); flushList(); flushQuote()
      const Tag = heading[1].length < 3 ? 'h3' : 'h4'
      blocks.push(<Tag key={`b-${blocks.length}`}>{inline(heading[2], `h-${blocks.length}`)}</Tag>)
      continue
    }
    const quoted = line.match(/^\s*>\s?(.*)$/)
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue }
    flushQuote()
    if (isList(line)) {
      flushParagraph()
      const marker = line.match(/^\s*(\d+)[.)]\s+(.+)$|^\s*[-*+]\s+(.+)$/)
      const ordered = !!marker[1]
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push((marker[2] || marker[3]).trim())
      continue
    }
    flushList()
    paragraph.push(line.trim())
  }
  if (code) blocks.push(<pre key={`b-${blocks.length}`}><code>{code.lines.join('\n')}</code></pre>)
  flushParagraph(); flushList(); flushQuote()
  return <div className="assistant-rich-text">{blocks}</div>
}

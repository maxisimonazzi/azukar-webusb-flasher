/** Small Markdown subset for the Help modal. Escape first; no raw HTML. */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(text: string): string {
  return text
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export function renderHelpMarkdown(src: string): string {
  const lines = escapeHtml(src.replace(/\r\n/g, '\n')).split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: string[] | null = null

  const flushPara = () => {
    if (!para.length) return
    out.push(`<p>${inline(para.join(' '))}</p>`)
    para = []
  }
  const flushList = () => {
    if (!list) return
    out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`)
    list = null
  }

  for (const raw of lines) {
    const line = raw
    if (line.startsWith('### ')) {
      flushPara()
      flushList()
      out.push(`<h3>${inline(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      flushPara()
      flushList()
      out.push(`<h2>${inline(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      flushPara()
      flushList()
      out.push(`<h1>${inline(line.slice(2))}</h1>`)
      continue
    }
    if (line.startsWith('- ')) {
      flushPara()
      if (!list) list = []
      list.push(line.slice(2))
      continue
    }
    if (line.trim() === '') {
      flushPara()
      flushList()
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushPara()
  flushList()
  return out.join('\n')
}

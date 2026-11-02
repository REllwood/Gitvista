const CO_AUTHOR_PATTERN = /^Co-authored-by:\s*.+?\s*<([^<>\s]+@[^<>\s]+)>\s*$/gim

export function normaliseCoAuthor(author) {
  const rawName = typeof author?.name === 'string' ? author.name : ''
  const rawEmail = typeof author?.email === 'string' ? author.email : ''
  if (/[\r\n<>]/.test(rawName) || /[\r\n<>]/.test(rawEmail)) return null
  const name = rawName.trim().replace(/[\t ]+/g, ' ')
  const email = rawEmail.trim()
  if (!name || !email || /\s/.test(email)) return null
  if (!/^[^@]+@[^@]+$/.test(email)) return null
  return { name, email }
}

export function appendCoAuthors(message, authors = []) {
  const base = typeof message === 'string' ? message.trim() : ''
  if (!base) return ''

  const existing = new Set()
  for (const match of base.matchAll(CO_AUTHOR_PATTERN)) existing.add(match[1].toLocaleLowerCase())

  const trailers = []
  for (const candidate of authors) {
    const author = normaliseCoAuthor(candidate)
    if (!author) continue
    const key = author.email.toLocaleLowerCase()
    if (existing.has(key)) continue
    existing.add(key)
    trailers.push(`Co-authored-by: ${author.name} <${author.email}>`)
  }

  return trailers.length ? `${base}\n\n${trailers.join('\n')}` : base
}

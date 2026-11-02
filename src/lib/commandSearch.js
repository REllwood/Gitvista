function normalise(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function commandScore(command, query) {
  const cleanedQuery = normalise(query)
  if (!cleanedQuery) return 0

  const words = cleanedQuery.split(/\s+/).filter(Boolean)
  const label = normalise(command.label)
  const category = normalise(command.category)
  const keywords = normalise(command.keywords)
  const haystack = `${label} ${category} ${keywords}`
  if (!words.every((word) => haystack.includes(word))) return -1

  let score = 10
  if (label === cleanedQuery) score += 140
  else if (label.startsWith(cleanedQuery)) score += 100
  else if (label.includes(cleanedQuery)) score += 60
  score += words.filter((word) => label.includes(word)).length * 15
  return score - Math.min(label.length, 80) / 100
}

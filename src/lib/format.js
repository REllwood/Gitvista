// Small presentational helpers shared across components.

export function shortHash(hash) {
  if (!hash) return ''
  if (hash.startsWith('ghost-')) return 'new'
  return hash.slice(0, 7)
}

export function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const sec = Math.round(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  const mon = Math.round(day / 30)
  if (mon < 12) return `${mon} month${mon === 1 ? '' : 's'} ago`
  const yr = Math.round(mon / 12)
  return `${yr} year${yr === 1 ? '' : 's'} ago`
}

export function fullDate(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return new Date(ts).toString()
  }
}

export function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  '#4c8dff', '#e668a7', '#f2b134', '#36c5a3', '#a06bf0',
  '#ff7a59', '#3ec1d3', '#9ccc4f', '#f06292', '#7e8cff',
]

// Deterministic colour per author so the same person always looks the same.
export function avatarColor(seed) {
  const s = seed || ''
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

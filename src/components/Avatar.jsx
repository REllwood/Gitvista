import { useState, useEffect } from 'react'
import { initials, avatarColor } from '../lib/format'
import { avatarUrl } from '../lib/avatar'

// Shows the author's real profile image (GitHub / Gravatar) when available,
// falling back to a colored initials bubble if there's none or we're offline.
export default function Avatar({ name, email, size = 22 }) {
  const url = avatarUrl(email, size)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [url])

  if (url && !broken) {
    return (
      <img
        className="avatar avatar-img"
        style={{ width: size, height: size }}
        src={url}
        alt={name || ''}
        title={name || 'Unknown'}
        loading="lazy"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    )
  }

  const bg = avatarColor(email || name)
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.42) }}
      title={name || 'Unknown'}
    >
      {initials(name)}
    </span>
  )
}

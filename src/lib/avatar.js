import md5 from './md5.js'

// Resolves a commit author's email to a profile-image URL.
//   - GitHub noreply emails (12345+user@users.noreply.github.com) → the user's
//     real GitHub avatar via their numeric id, or github.com/<user>.png.
//   - Any other email → Gravatar (the same service GitHub falls back to),
//     with d=404 so missing avatars error out and we show initials instead.
export function avatarUrl(email, size = 24) {
  if (!email) return null
  const e = email.trim().toLowerCase()
  const px = Math.round(size * 2) // 2x for crisp retina rendering

  const noreply = e.match(/^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/)
  if (noreply) {
    if (noreply[1]) return `https://avatars.githubusercontent.com/u/${noreply[1]}?s=${px}&v=4`
    return `https://github.com/${encodeURIComponent(noreply[2])}.png?size=${px}`
  }

  return `https://www.gravatar.com/avatar/${md5(e)}?s=${px}&d=404`
}

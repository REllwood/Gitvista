// Turns free-text ("My new login feature!") into a valid git/GitHub branch
// name ("my-new-login-feature"). Git ref rules forbid spaces, ~^:?*[\, "..",
// leading/trailing "/" "." "-", and a trailing ".lock".
const ACCENTS = new RegExp('[\\u0300-\\u036f]', 'g')

export function slugifyBranch(input) {
  let s = (input || '').trim().toLowerCase()
  try {
    s = s.normalize('NFKD').replace(ACCENTS, '') // strip accents (é → e)
  } catch {
    /* normalize unsupported — ignore */
  }
  s = s.replace(/[^a-z0-9._/\- ]+/g, ' ') // unknown chars → space
  s = s.replace(/[\s_]+/g, '-') // whitespace/underscore → hyphen
  s = s.replace(/\/{2,}/g, '/') // collapse multiple slashes
  s = s.replace(/-{2,}/g, '-') // collapse multiple hyphens
  s = s.replace(/\.{2,}/g, '.') // no ".."
  s = s.replace(/\.lock(?=$|\/)/g, 'lock') // avoid a ".lock" ending
  s = s
    .split('/')
    .map((part) => part.replace(/^[-.]+/, '').replace(/[-.]+$/, ''))
    .filter(Boolean)
    .join('/') // every ref path component must have safe edges
  return s
}

// Splits a unified diff into its file header and individual hunks, keeping the
// raw text so we can reconstruct a valid one-hunk patch for `git apply`.

export function splitHunks(text) {
  const lines = (text || '').split('\n')
  const header = []
  const hunks = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (cur) hunks.push(cur)
      cur = { header: line, lines: [line] }
    } else if (cur) {
      cur.lines.push(line)
    } else {
      header.push(line)
    }
  }
  if (cur) hunks.push(cur)
  return {
    header: header.join('\n'),
    hunks: hunks.map((h, i) => ({ index: i, header: h.header, raw: h.lines.join('\n') })),
  }
}

// A valid single-hunk patch = the file header lines + one hunk, both trimmed of
// trailing blank lines and terminated by a single newline.
export function buildHunkPatch(header, hunkRaw) {
  const h = (header || '').replace(/\n+$/, '')
  const k = (hunkRaw || '').replace(/\n+$/, '')
  return `${h}\n${k}\n`
}

// A diff is hunk-stageable only if it has a real file header (so git apply knows
// the path) and at least one hunk. Synthesized untracked-file views have none.
export function isPatchable(text) {
  if (!text) return false
  const { header, hunks } = splitHunks(text)
  return hunks.length > 0 && /(^|\n)(diff --git |--- |\+\+\+ )/.test(header)
}

// ---- word-level (intra-line) diff ------------------------------------------

function tokenize(s) {
  return (s || '').match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]+/g) || []
}

// Compares two lines token-by-token (LCS) and marks the tokens that differ, so
// a changed line can highlight just the words that actually changed.
//
// The LCS table is O(m*n), so for very long or minified lines we'd allocate a
// huge matrix and blow the heap (crashing the renderer). Guard that: above a
// safe size, fall back to marking the whole line changed — no intra-line detail,
// but no crash.
const WORD_DIFF_MAX_CELLS = 200000

export function wordDiff(a, b) {
  const A = tokenize(a)
  const B = tokenize(b)
  const m = A.length
  const n = B.length
  if (m * n > WORD_DIFF_MAX_CELLS) {
    return { old: [{ text: a || '', changed: true }], new: [{ text: b || '', changed: true }] }
  }
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const oldParts = []
  const newParts = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (A[i] === B[j]) {
      oldParts.push({ text: A[i], changed: false })
      newParts.push({ text: B[j], changed: false })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      oldParts.push({ text: A[i], changed: true })
      i++
    } else {
      newParts.push({ text: B[j], changed: true })
      j++
    }
  }
  while (i < m) oldParts.push({ text: A[i++], changed: true })
  while (j < n) newParts.push({ text: B[j++], changed: true })
  return { old: oldParts, new: newParts }
}

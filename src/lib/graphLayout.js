// Turns a flat, date-ordered list of commits (newest first) into a laid-out
// graph: every commit gets a lane (column) and row, and every parent link
// becomes an edge. This is the same idea behind `git log --graph`, but with
// coordinates we can draw with SVG.

export const LANE_COLORS = [
  '#4c8dff', // blue
  '#e668a7', // pink
  '#f2b134', // amber
  '#36c5a3', // teal
  '#a06bf0', // purple
  '#ff7a59', // coral
  '#3ec1d3', // cyan
  '#9ccc4f', // lime
  '#f06292', // rose
  '#7e8cff', // periwinkle
]

export function laneColor(lane) {
  return LANE_COLORS[((lane % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length]
}

export function computeGraph(commits) {
  const indexByHash = new Map(commits.map((c, i) => [c.hash, i]))

  // lanes[i] holds the hash that lane i is currently "waiting" to place
  // (a not-yet-seen parent), or null when the lane is free.
  const lanes = []
  const nodes = []
  const rawEdges = []

  const allocLane = (hash) => {
    let i = lanes.indexOf(null)
    if (i === -1) {
      i = lanes.length
      lanes.push(hash)
    } else {
      lanes[i] = hash
    }
    return i
  }

  for (let row = 0; row < commits.length; row++) {
    const c = commits[row]

    // The leftmost lane already expecting this commit becomes its lane.
    let myLane = lanes.indexOf(c.hash)
    if (myLane === -1) myLane = allocLane(c.hash) // a branch tip with no children yet

    // Any other lane that was also waiting for this commit collapses in here.
    for (let i = 0; i < lanes.length; i++) {
      if (i !== myLane && lanes[i] === c.hash) lanes[i] = null
    }

    const color = laneColor(myLane)
    nodes.push({ ...c, lane: myLane, row, color })

    // Free our lane; the first parent will re-claim it for a straight line.
    lanes[myLane] = null

    c.parents.forEach((parent, pi) => {
      if (!indexByHash.has(parent)) return // parent outside our window — no edge

      let pLane
      if (pi === 0) {
        if (lanes[myLane] == null) {
          lanes[myLane] = parent
          pLane = myLane
        } else {
          const existing = lanes.indexOf(parent)
          pLane = existing !== -1 ? existing : allocLane(parent)
        }
      } else {
        const existing = lanes.indexOf(parent)
        pLane = existing !== -1 ? existing : allocLane(parent)
      }

      rawEdges.push({
        fromRow: row,
        fromLane: myLane,
        toHash: parent,
        toLane: pLane,
        color: pi === 0 ? color : laneColor(pLane),
        isMerge: pi > 0,
      })
    })
  }

  // Resolve each edge against where its parent commit *actually* landed. A
  // parent reserved in several lanes settles in the leftmost one, so the
  // recorded target lane can differ from the final node position.
  const rowByHash = new Map(nodes.map((n) => [n.hash, n.row]))
  const laneByHash = new Map(nodes.map((n) => [n.hash, n.lane]))
  const edges = rawEdges
    .map((e) => {
      const toRow = rowByHash.get(e.toHash)
      const toLane = laneByHash.has(e.toHash) ? laneByHash.get(e.toHash) : e.toLane
      const color = e.isMerge ? laneColor(toLane) : e.color
      return { ...e, toRow, toLane, color }
    })
    .filter((e) => e.toRow != null)

  let laneCount = 1
  for (const n of nodes) laneCount = Math.max(laneCount, n.lane + 1)
  for (const e of edges) laneCount = Math.max(laneCount, e.fromLane + 1, e.toLane + 1)

  return { nodes, edges, laneCount }
}

// Pixel width of the graph column for a given lane count, so the SVG and the
// HTML commit rows beside it can be aligned to the same offset.
export function graphWidth(laneCount, geom, labelWidth = 0) {
  const { padX, laneWidth, nodeR } = geom
  return padX + Math.max(0, laneCount - 1) * laneWidth + nodeR + 14 + labelWidth
}

// Builds the SVG path string for one parent edge, choosing where to "bend".
//   - straight when child and parent share a lane
//   - merge edges bend right under the child (the merge commit)
//   - branch-base edges bend just above the parent (where a branch was cut)
export function edgePath(e, geom) {
  const { rowHeight, laneWidth, padX } = geom
  const x = (lane) => padX + lane * laneWidth
  const y = (row) => row * rowHeight + rowHeight / 2

  const x1 = x(e.fromLane)
  const y1 = y(e.fromRow)
  const x2 = x(e.toLane)
  const y2 = y(e.toRow)

  if (e.fromLane === e.toLane) return `M ${x1} ${y1} L ${x2} ${y2}`

  const bend = rowHeight * 0.7
  if (e.isMerge) {
    // Leave the child, curve across to the parent's lane, then run straight down.
    const my = Math.min(y1 + bend, y2)
    return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${my - bend}, ${x2} ${my} L ${x2} ${y2}`
  }
  // First-parent on a different lane: run straight down the child lane, then
  // curve into the parent lane near the bottom (a branch's base point).
  const my = Math.max(y2 - bend, y1)
  return `M ${x1} ${y1} L ${x1} ${my} C ${x1} ${my + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
}

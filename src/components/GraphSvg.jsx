import { useId } from 'react'
import { edgePath, graphWidth } from '../lib/graphLayout'

// Pure SVG renderer for a laid-out graph: edges first, then commit nodes.
// Used by the main history view (no labels) and by the mini preview graphs
// (with labels). Ghost (preview) nodes and edges are drawn dashed. In previews
// they pop in one after another and their edges draw themselves in, and a
// branch label that moves glides from its old commit to its new one.
const LABEL_W = 300
const PILL_H = 16
const pillText = (name) => (name.length > 18 ? `${name.slice(0, 17)}…` : name)
const pillWidth = (name) => pillText(name).length * 5.7 + 14

export default function GraphSvg({
  nodes,
  edges,
  laneCount,
  geom,
  selectedHash,
  onSelectNode,
  labelFor,
  hoverHash = null,
  focusHashes = null,
  freshHashes = null,
  refOrigins = null,
}) {
  const uid = useId().replace(/:/g, '')
  const { rowHeight, laneWidth, padX, nodeR } = geom
  const hasLabels = !!labelFor
  const width = graphWidth(laneCount, geom, hasLabels ? LABEL_W : 0)
  const height = Math.max(rowHeight, nodes.length * rowHeight)
  const x = (lane) => padX + lane * laneWidth
  const y = (row) => row * rowHeight + rowHeight / 2
  const labelX = padX + Math.max(0, laneCount - 1) * laneWidth + nodeR + 14
  const graphRight = padX + Math.max(0, laneCount - 1) * laneWidth + nodeR + 14
  const byRow = nodes.map((node) => node)
  const dashedRows = new Set(nodes.filter((n) => n.ghost || n.wip).map((n) => n.row))
  const ghostOrder = new Map(nodes.filter((n) => n.ghost).map((n, i) => [n.hash, i]))
  const selected = selectedHash ? nodes.find((n) => n.hash === selectedHash) : null
  // Rows that a branch label leaves keep room for it while it glides away.
  const departed = new Map()
  if (refOrigins) {
    for (const n of nodes) {
      for (const ref of n.refs || []) {
        const origin = ref.ghost ? refOrigins.get(ref.name) : undefined
        if (origin != null && origin !== n.row) departed.set(origin, (departed.get(origin) || 0) + pillWidth(ref.name) + 6)
      }
    }
  }
  const isFocused = (hash) => !focusHashes || focusHashes.has(hash)

  return (
    <svg width={width} height={height} className={'graph-svg' + (focusHashes ? ' has-focus' : '')} style={{ minWidth: width }}>
      <defs>
        {selected && (
          <linearGradient id={`${uid}-sel`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={selected.color} stopOpacity="0.28" />
            <stop offset="1" stopColor={selected.color} stopOpacity="0" />
          </linearGradient>
        )}
        {hasLabels &&
          edges.map((e, i) =>
            dashedRows.has(e.fromRow) || dashedRows.has(e.toRow) ? (
              <mask key={i} id={`${uid}-draw${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
                <path
                  d={edgePath(e, geom)}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={6}
                  pathLength={1}
                  className="edge-draw"
                  style={{ animationDelay: `${120 + (ghostOrder.get(byRow[e.fromRow]?.hash) ?? 0) * 40}ms` }}
                />
              </mask>
            ) : null
          )}
      </defs>
      {selected && !hasLabels && (
        <rect
          className="graph-selection"
          x={x(selected.lane)}
          y={selected.row * rowHeight}
          width={Math.max(0, graphRight - x(selected.lane))}
          height={rowHeight}
          fill={`url(#${uid}-sel)`}
        />
      )}
      <g>
        {edges.map((e, i) => {
          const dashed = dashedRows.has(e.fromRow) || dashedRows.has(e.toRow)
          const fromHash = byRow[e.fromRow]?.hash
          const toHash = byRow[e.toRow]?.hash
          const lit = hoverHash && (fromHash === hoverHash || toHash === hoverHash)
          const faded = focusHashes && !focusHashes.has(fromHash)
          const fresh = freshHashes && (freshHashes.has(fromHash) || freshHashes.has(toHash))
          return (
            <path
              key={i}
              d={edgePath(e, geom)}
              fill="none"
              stroke={e.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={'edge' + (dashed ? ' ghost' : '') + (lit ? ' lit' : '') + (faded ? ' faded' : '') + (fresh ? ' fresh' : '')}
              strokeDasharray={dashed ? '5 4' : undefined}
              mask={hasLabels && dashed ? `url(#${uid}-draw${i})` : undefined}
            />
          )
        })}
      </g>
      <g>
        {nodes.map((n) => {
          const head = (n.refs || []).some((r) => r.type === 'head' || r.type === 'detached')
          const isSelected = selectedHash === n.hash
          const merge = (n.parents || []).length > 1
          const cx = x(n.lane)
          const cy = y(n.row)
          const order = ghostOrder.get(n.hash)
          const className =
            'graph-node' +
            (hoverHash === n.hash ? ' hovered' : '') +
            (isFocused(n.hash) ? '' : ' faded') +
            (n.ghost && hasLabels ? ' ghost-pop' : '') +
            (freshHashes?.has(n.hash) ? ' fresh' : '')
          return (
            <g
              key={n.ghost ? `ghost-row-${n.row}` : n.hash}
              className={className}
              onClick={onSelectNode ? () => onSelectNode(n.hash, n) : undefined}
              style={{
                ...(onSelectNode ? { cursor: 'pointer' } : null),
                ...(order != null && hasLabels ? { animationDelay: `${order * 40}ms` } : null),
              }}
            >
              {onSelectNode && <rect x={0} y={cy - rowHeight / 2} width={width} height={rowHeight} fill="transparent" />}
              <g className="node-shape" style={{ transformOrigin: `${cx}px ${cy}px` }}>
                {isSelected && <circle cx={cx} cy={cy} r={nodeR + 5} fill="none" stroke={n.color} strokeWidth={1.5} opacity={0.75} />}
                {head && <circle cx={cx} cy={cy} r={nodeR + 6} fill={n.color} opacity={0.16} className="head-glow" />}
                {head && <circle cx={cx} cy={cy} r={nodeR + 3} fill="none" stroke={n.color} strokeWidth={2} />}
                {n.wip ? (
                  <circle className="wip-node" cx={cx} cy={cy} r={nodeR + 1} fill="var(--bg)" stroke={n.color} strokeWidth={2} strokeDasharray="0.1 3.2" strokeLinecap="round" />
                ) : n.stash ? (
                  <rect className="stash-node" x={cx - nodeR} y={cy - nodeR} width={nodeR * 2} height={nodeR * 2} rx={2.5} fill="var(--bg)" stroke={n.color} strokeWidth={2} strokeDasharray="0.1 3" strokeLinecap="round" />
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={merge && !n.ghost ? nodeR - 0.5 : nodeR}
                    fill={n.ghost || merge ? 'var(--bg)' : n.color}
                    stroke={n.color}
                    strokeWidth={2}
                    strokeDasharray={n.ghost ? '3 2' : undefined}
                  />
                )}
              </g>
              {hasLabels && <PreviewLabel node={n} x={labelX} y={cy} rowHeight={rowHeight} refOrigins={refOrigins} labelFor={labelFor} room={departed.get(n.row) || 0} />}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// A preview row label: any branch pills that land on this commit, then the
// commit subject. A pill that moved here from another commit starts at its old
// row and glides into place.
function PreviewLabel({ node, x, y, rowHeight, refOrigins, labelFor, room }) {
  const pills = (node.refs || []).filter((ref) => ref.type === 'head' || ref.type === 'branch')
  let offset = x
  return (
    <>
      {pills.map((ref) => {
        const text = pillText(ref.name)
        const w = pillWidth(ref.name)
        const origin = ref.ghost ? refOrigins?.get(ref.name) : undefined
        const shift = origin != null && origin !== node.row ? (origin - node.row) * rowHeight : 0
        const left = offset
        offset += w + 6
        return (
          <g key={ref.name} className={'preview-pill' + (ref.ghost ? ' ghost' : '') + (shift ? ' glide' : '')} style={shift ? { '--glide-from': `${shift}px` } : undefined}>
            {shift ? <rect className="preview-pill-origin" x={left} y={y - PILL_H / 2 + shift} width={w} height={PILL_H} rx={4} /> : null}
            <g className="preview-pill-body">
              <rect x={left} y={y - PILL_H / 2} width={w} height={PILL_H} rx={4} fill={node.color} />
              <text x={left + 7} y={y + 4}>{text}</text>
            </g>
          </g>
        )
      })}
      <text
        x={offset}
        y={y + 4}
        className={(node.ghost ? 'node-label ghost' : 'node-label') + (room ? ' making-room' : '')}
        style={room ? { '--room': `${room}px` } : undefined}
      >
        {labelFor(node)}
      </text>
    </>
  )
}

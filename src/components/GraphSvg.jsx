import { edgePath, graphWidth } from '../lib/graphLayout'

// Pure SVG renderer for a laid-out graph: edges first, then commit nodes.
// Used by the main history view (no labels) and by the mini preview graphs
// (with labels). Ghost (preview) nodes/edges are drawn dashed and dimmed.
const LABEL_W = 300

export default function GraphSvg({ nodes, edges, laneCount, geom, selectedHash, onSelectNode, labelFor }) {
  const { rowHeight, laneWidth, padX, nodeR } = geom
  const hasLabels = !!labelFor
  const width = graphWidth(laneCount, geom, hasLabels ? LABEL_W : 0)
  const height = Math.max(rowHeight, nodes.length * rowHeight)
  const x = (lane) => padX + lane * laneWidth
  const y = (row) => row * rowHeight + rowHeight / 2
  const labelX = padX + Math.max(0, laneCount - 1) * laneWidth + nodeR + 14
  const ghostRows = new Set(nodes.filter((n) => n.ghost).map((n) => n.row))

  return (
    <svg width={width} height={height} className="graph-svg" style={{ minWidth: width }}>
      <g>
        {edges.map((e, i) => {
          const ghost = ghostRows.has(e.fromRow) || ghostRows.has(e.toRow)
          return (
            <path
              key={i}
              d={edgePath(e, geom)}
              fill="none"
              stroke={e.color}
              strokeWidth={2.25}
              strokeLinecap="round"
              className={ghost ? 'edge ghost' : 'edge'}
              strokeDasharray={ghost ? '4 4' : undefined}
              opacity={ghost ? 0.7 : 1}
            />
          )
        })}
      </g>
      <g>
        {nodes.map((n) => {
          const head = (n.refs || []).some((r) => r.type === 'head' || r.type === 'detached')
          const selected = selectedHash === n.hash
          const cx = x(n.lane)
          const cy = y(n.row)
          return (
            <g
              key={n.hash}
              className="graph-node"
              onClick={onSelectNode ? () => onSelectNode(n.hash, n) : undefined}
              style={onSelectNode ? { cursor: 'pointer' } : undefined}
            >
              {onSelectNode && <rect x={0} y={cy - rowHeight / 2} width={width} height={rowHeight} fill="transparent" />}
              {selected && <circle cx={cx} cy={cy} r={nodeR + 4} fill="none" stroke={n.color} strokeWidth={1.5} opacity={0.8} />}
              {head && <circle cx={cx} cy={cy} r={nodeR + 2.5} fill="none" stroke={n.color} strokeWidth={2} />}
              <circle
                cx={cx}
                cy={cy}
                r={nodeR}
                fill={n.ghost ? 'var(--bg)' : n.color}
                stroke={n.color}
                strokeWidth={2}
                strokeDasharray={n.ghost ? '3 2' : undefined}
              />
              {labelFor && (
                <text x={labelX} y={cy + 4} className={n.ghost ? 'node-label ghost' : 'node-label'}>
                  {labelFor(n)}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

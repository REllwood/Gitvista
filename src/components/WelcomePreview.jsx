import { useId } from 'react'

// A looping demonstration of GitVista's preview on the welcome screen: dashed
// ghost edges draw in, a ghost merge commit appears, and the "main" label
// glides up onto it. With reduced motion it shows the merged result.
export default function WelcomePreview() {
  const id = useId().replace(/:/g, '')
  const ghostEdges = ['M24 58 L24 24', 'M52 88 L52 40 C52 30 24 34 24 24']
  return (
    <figure className="welcome-preview" aria-label="Example preview of merging a feature branch into main">
      <figcaption>
        <span>Preview</span>
        <code>git merge feature</code>
      </figcaption>
      <svg viewBox="0 0 300 140" width="100%" role="img" aria-hidden="true">
        <defs>
          {ghostEdges.map((d, i) => (
            <mask key={d} id={`${id}-m${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="140">
              <path d={d} pathLength={1} className="wp-draw" fill="none" stroke="#fff" strokeWidth="6" />
            </mask>
          ))}
        </defs>
        <path d="M24 58 L24 140" className="wp-edge" stroke="#4c8dff" />
        <path d="M52 88 L52 104 C52 112 24 110 24 118" className="wp-edge" stroke="#e668a7" />
        <circle cx="24" cy="58" r="5" fill="#4c8dff" />
        <circle cx="52" cy="88" r="5" fill="#e668a7" />
        <circle cx="24" cy="118" r="5" fill="#4c8dff" />
        <g className="wp-ghost">
          {ghostEdges.map((d, i) => (
            <path key={d} d={d} className="wp-edge" stroke={i ? '#e668a7' : '#4c8dff'} strokeDasharray="5 4" mask={`url(#${id}-m${i})`} />
          ))}
          <circle cx="24" cy="24" r="6" className="wp-ghost-node" fill="var(--bg)" stroke="#4c8dff" strokeWidth="2" strokeDasharray="3 2" />
          <text x="130" y="28" className="wp-text wp-ghost-text">Merge feature into main</text>
        </g>
        <text x="130" y="62" className="wp-text">Polish settings page</text>
        <text x="130" y="92" className="wp-text">Add search</text>
        <text x="130" y="122" className="wp-text">Set up project</text>
        <g className="wp-pill wp-pill-main">
          <rect x="76" y="50" width="44" height="16" rx="4" fill="var(--accent)" />
          <text x="98" y="61.5" textAnchor="middle">main</text>
        </g>
        <g className="wp-pill">
          <rect x="68" y="80" width="56" height="16" rx="4" fill="#e668a7" />
          <text x="96" y="91.5" textAnchor="middle">feature</text>
        </g>
      </svg>
    </figure>
  )
}

/** Inline SVG artwork: gold bounty and dynamite bundle. Flat, engraved Western style; no glow. */

export function BountyArt() {
  return (
    <svg viewBox="0 0 64 64" className="art art--bounty" aria-hidden="true" focusable="false">
      {/* sheriff-style star badge over a gold nugget pile */}
      <ellipse cx="32" cy="50" rx="22" ry="6" fill="#6b4a1f" opacity="0.35" />
      <path d="M14 46c2-7 8-10 13-9 3-5 11-6 15-1 5-1 9 3 9 9 0 4-5 6-18 6s-20-1-19-5z" fill="#c9952e" stroke="#5a3a14" strokeWidth="1.5" />
      <path d="M20 44c2-3 5-4 8-3M34 40c3-2 7-1 9 1" stroke="#f3d68a" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path
        d="M32 6l5.3 10.7 11.8 1.7-8.5 8.3 2 11.7L32 32.9l-10.6 5.5 2-11.7-8.5-8.3 11.8-1.7z"
        fill="#e3b23c"
        stroke="#5a3a14"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="22" r="5" fill="#f3d68a" stroke="#5a3a14" strokeWidth="1.5" />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={32 + 15.5 * Math.sin((a * Math.PI) / 180)} cy={22 - 15.5 * Math.cos((a * Math.PI) / 180)} r="1.8" fill="#5a3a14" />
      ))}
    </svg>
  );
}

export function DynamiteArt({ lit = false }: { readonly lit?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="art art--dynamite" aria-hidden="true" focusable="false">
      <ellipse cx="32" cy="54" rx="20" ry="5" fill="#000" opacity="0.3" />
      {[18, 28, 38].map((x, i) => (
        <g key={x} transform={`rotate(${(i - 1) * 6} 32 40)`}>
          <rect x={x} y="22" width="10" height="32" rx="2" fill="#a8321f" stroke="#3a120a" strokeWidth="1.5" />
          <rect x={x + 1.5} y="24" width="2.5" height="28" fill="#c9533a" opacity="0.7" />
        </g>
      ))}
      <path d="M16 34h32M16 44h32" stroke="#6b4a2a" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M33 22c0-6 4-9 9-10" stroke="#2f2c29" strokeWidth="2" fill="none" strokeLinecap="round" />
      {lit && (
        <g className="fuse-spark">
          <circle cx="43" cy="11" r="3.4" fill="#f0a040" />
          <path d="M43 4v4M49 11h-4M43 18v-4M37 11h4M47.5 6.5l-2.5 2.5M38.5 15.5l2.5-2.5" stroke="#d0632b" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

export function BlastArt() {
  return (
    <svg viewBox="0 0 64 64" className="art art--blast" aria-hidden="true" focusable="false">
      <path
        d="M32 4l5 13 12-7-4 13 14 2-12 8 10 10-14-1 1 14-10-9-8 12-3-14-13 5 6-13-13-6 14-4-7-12 13 5z"
        fill="#d0632b"
        stroke="#5a1a0a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M32 16l3 8 8-3-3 8 8 3-8 3 3 8-8-3-3 8-3-8-8 3 3-8-8-3 8-3-3-8 8 3z" fill="#f0c060" />
    </svg>
  );
}

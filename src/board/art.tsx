/** Inline SVG artwork: gold bounty, dynamite bundle and the blast crater. Engraved Western style; no glow. */

export function BountyArt() {
  return (
    <svg viewBox="0 0 64 64" className="art art--bounty" aria-hidden="true" focusable="false">
      {/* sheriff-style star badge over a gold nugget pile */}
      <ellipse cx="32" cy="51" rx="22" ry="5.5" fill="#6b4a1f" opacity="0.32" />
      <path d="M14 46c2-7 8-10 13-9 3-5 11-6 15-1 5-1 9 3 9 9 0 4-5 6-18 6s-20-1-19-5z" fill="#c9952e" stroke="#5a3a14" strokeWidth="1.5" />
      <path d="M20 44c2-3 5-4 8-3M34 40c3-2 7-1 9 1" stroke="#f3d68a" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M24 48l3-2M38 47l3-1" stroke="#8a6420" strokeWidth="1.2" strokeLinecap="round" />
      <g className="art__star">
        <path
          d="M32 6l5.3 10.7 11.8 1.7-8.5 8.3 2 11.7L32 32.9l-10.6 5.5 2-11.7-8.5-8.3 11.8-1.7z"
          fill="#e3b23c"
          stroke="#5a3a14"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* engraved bevel on the lit (upper-right) points */}
        <path d="M32 9.5l4.2 8.4M45.5 19.6l-6.7 6.5" stroke="#f3d68a" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
        <circle cx="32" cy="22" r="5" fill="#f3d68a" stroke="#5a3a14" strokeWidth="1.5" />
        {[0, 72, 144, 216, 288].map((a) => (
          <circle key={a} cx={32 + 15.5 * Math.sin((a * Math.PI) / 180)} cy={22 - 15.5 * Math.cos((a * Math.PI) / 180)} r="1.8" fill="#5a3a14" />
        ))}
      </g>
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
          <rect x={x + 1} y="26" width="8" height="5" fill="#e2cfa6" opacity="0.55" />
        </g>
      ))}
      <path d="M16 34h32M16 44h32" stroke="#6b4a2a" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M33 22c0-6 4-9 9-10" stroke="#2f2c29" strokeWidth="2" fill="none" strokeLinecap="round" />
      {lit && (
        <g className="fuse-spark">
          <circle cx="43" cy="11" r="3.4" fill="#f0a040" />
          <circle cx="43" cy="11" r="1.6" fill="#fff0c8" />
          <path d="M43 4v4M49 11h-4M43 18v-4M37 11h4M47.5 6.5l-2.5 2.5M38.5 15.5l2.5-2.5" stroke="#d0632b" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** What is left of the lid: a charred hole, broken plank ends bent outward (each a different length and width), live embers. */
export function BlastArt() {
  // [angle°, length, half-width, jag]: hand-tuned so no two splinters match
  const shards: readonly (readonly [number, number, number, number])[] = [
    [-84, 1.05, 2.6, 0.6],
    [-38, 0.72, 1.8, -0.8],
    [8, 1.12, 3.1, 0.4],
    [52, 0.84, 2.2, -0.5],
    [96, 0.66, 1.6, 0.9],
    [128, 1.0, 2.8, -0.3],
    [172, 0.78, 2.0, 0.7],
    [214, 1.08, 2.5, -0.6],
    [262, 0.7, 1.7, 0.5],
    [304, 0.94, 2.4, -0.9],
  ];
  return (
    <svg viewBox="0 0 64 64" className="art art--blast" aria-hidden="true" focusable="false">
      {/* soot bloom across the lid, the plank seams scorched through */}
      <circle cx="32" cy="33" r="29" fill="#1b100a" opacity="0.32" />
      <circle cx="32" cy="33" r="21" fill="#1b100a" opacity="0.42" />
      <path d="M21 4v56M43 4v56" stroke="#0e0804" strokeWidth="1.4" opacity="0.5" />
      <path d="M32 19.5l4.5 3.6 6.6-1.4 0.8 6.8 5.1 4.4-4.6 4.1-0.4 6.9-6.9-1.2-5.1 4.7-4.8-5-6.8 0.9-0.9-6.8-4.9-4.3 4.7-4.6 1.2-6.7 6.7 1.5z" fill="#0e0804" />
      {shards.map(([deg, len, w, jag]) => {
        const r0 = 9.5;
        const r1 = r0 + 14 * len;
        return (
          <g key={deg} transform={`rotate(${deg} 32 33)`}>
            <path
              d={`M${32 - w} ${33 - r0} L${32 - w * 0.5 + jag} ${33 - r1 + 2} L${32 + jag * 0.6} ${33 - r1} L${32 + w * 0.7} ${33 - r1 + 3.5} L${32 + w} ${33 - r0}z`}
              fill="#a87a4c"
              stroke="#2a1a10"
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
            {/* lit edge on one side, charred tip */}
            <path d={`M${32 - w * 0.6} ${33 - r0 - 1} L${32 - w * 0.3 + jag} ${33 - r1 + 3}`} stroke="#d1a575" strokeWidth="0.7" opacity="0.8" />
            <path d={`M${32 - w * 0.5 + jag} ${33 - r1 + 2} L${32 + jag * 0.6} ${33 - r1} L${32 + w * 0.7} ${33 - r1 + 3.5}z`} fill="#24160d" />
          </g>
        );
      })}
      <g className="art__embers">
        <circle cx="27" cy="30" r="1.3" fill="#d0632b" />
        <circle cx="37.5" cy="36" r="1.1" fill="#e0864a" />
        <circle cx="33" cy="27.5" r="0.9" fill="#f0a040" />
        <circle cx="29" cy="38" r="0.8" fill="#d0632b" />
      </g>
    </svg>
  );
}

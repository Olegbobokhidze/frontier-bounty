/** Frontier palette for canvas FX (CSS tokens mirror these in ui/styles/tokens.css). No neon. */
export const FRONTIER = {
  timberDark: '#2a1a10',
  timber: '#5a3a22',
  leather: '#7a4a2a',
  brass: '#c9a24e',
  brassLight: '#e8cf8a',
  gold: '#e3b23c',
  parchment: '#efe2c4',
  iron: '#2f2c29',
  smoke: '#8c8276',
  ember: '#d0632b',
  blood: '#9b2f1f',
  dust: '#d8c3a0',
} as const;

/** Animation timings (ms). The board, CSS and BoardPort all read these. */
export const TIMINGS = {
  normal: { safe: 420, hazard: 760 },
  turbo: { safe: 170, hazard: 320 },
  reduced: { safe: 60, hazard: 120 },
} as const;

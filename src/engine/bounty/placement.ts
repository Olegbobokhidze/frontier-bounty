import { createRng } from '../../core/rng';

/**
 * Deterministic hazard layout from a 32-bit seed (ADR-0005).
 * Partial Fisher–Yates over [0, cells): the first `hazards` slots are the dynamite cells.
 * Anyone with (serverSeed, clientSeed, nonce) can re-derive the seed and verify the layout.
 */
export function placeHazards(seed: number, cells: number, hazards: number): number[] {
  if (!Number.isInteger(cells) || cells < 2) throw new Error('placeHazards: cells must be >= 2');
  if (!Number.isInteger(hazards) || hazards < 1 || hazards >= cells) throw new Error('placeHazards: hazards out of range');
  const rng = createRng(seed);
  const deck = Array.from({ length: cells }, (_, i) => i);
  for (let i = 0; i < hazards; i++) {
    const j = i + rng.int(cells - i);
    const a = deck[i] as number;
    deck[i] = deck[j] as number;
    deck[j] = a;
  }
  return deck.slice(0, hazards).sort((a, b) => a - b);
}

/** First 4 bytes of a hex digest as an unsigned 32-bit seed. */
export function seedFromHex(hex: string): number {
  return parseInt(hex.slice(0, 8), 16) >>> 0;
}

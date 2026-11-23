/**
 * Provably-fair helpers (ADR-0005). Uses WebCrypto SHA-256 (browser and Node ≥ 20).
 *   commitment = SHA-256(serverSeed)
 *   roundSeed  = SHA-256(`${serverSeed}:${clientSeed}:${nonce}`) → first 4 bytes → placeHazards()
 */
import { placeHazards, seedFromHex } from '../engine/bounty/placement';

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function deriveLayout(serverSeed: string, clientSeed: string, nonce: number, cells: number, hazards: number): Promise<number[]> {
  const hex = await sha256Hex(`${serverSeed}:${clientSeed}:${nonce}`);
  return placeHazards(seedFromHex(hex), cells, hazards);
}

export type Verification = {
  readonly commitmentOk: boolean;
  readonly layoutOk: boolean;
  readonly derived: readonly number[];
};

/** Re-derive a finished round and compare it with what the server disclosed. */
export async function verifyRound(input: {
  readonly serverSeed: string;
  readonly serverSeedHash: string;
  readonly clientSeed: string;
  readonly nonce: number;
  readonly cells: number;
  readonly hazards: readonly number[];
}): Promise<Verification> {
  const commitmentOk = (await sha256Hex(input.serverSeed)) === input.serverSeedHash;
  const derived = await deriveLayout(input.serverSeed, input.clientSeed, input.nonce, input.cells, input.hazards.length);
  const disclosed = [...input.hazards].sort((a, b) => a - b);
  const layoutOk = derived.length === disclosed.length && derived.every((v, i) => v === disclosed[i]);
  return { commitmentOk, layoutOk, derived };
}

export function randomSeedHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

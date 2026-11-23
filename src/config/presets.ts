/** Territory presets: grid size + dynamite count. Data only (ADR-0002). */
export type TerritoryPreset = {
  readonly id: string;
  readonly name: string;
  readonly rows: number;
  readonly cols: number;
  readonly hazards: number;
  readonly blurb: string;
};

export const TERRITORY_PRESETS: readonly TerritoryPreset[] = [
  { id: 'greenhorn', name: 'Greenhorn Gulch', rows: 5, cols: 5, hazards: 1, blurb: 'One stick of dynamite. A gentle climb for new prospectors.' },
  { id: 'classic', name: 'Classic Claim', rows: 5, cols: 5, hazards: 3, blurb: 'The standard 5×5 claim with three charges buried.' },
  { id: 'gunslinger', name: "Gunslinger's Gamble", rows: 5, cols: 5, hazards: 8, blurb: 'Eight charges. Every step pays handsomely.' },
  { id: 'outlaw', name: 'Outlaw Badlands', rows: 5, cols: 5, hazards: 15, blurb: 'Fifteen charges. Only the boldest cash out.' },
  { id: 'homestead', name: 'Homestead Plot', rows: 4, cols: 4, hazards: 3, blurb: 'A small 4×4 plot: quick rounds.' },
  { id: 'deadwood', name: 'Deadwood Mine', rows: 6, cols: 6, hazards: 8, blurb: 'A deep 6×6 shaft with eight charges.' },
  { id: 'big-country', name: 'Big Country', rows: 8, cols: 8, hazards: 10, blurb: 'The open 8×8 frontier.' },
];

export const DEFAULT_PRESET_ID = 'classic';

export function findPreset(id: string): TerritoryPreset | undefined {
  return TERRITORY_PRESETS.find((p) => p.id === id);
}

export function presetFor(rows: number, cols: number, hazards: number): TerritoryPreset | undefined {
  return TERRITORY_PRESETS.find((p) => p.rows === rows && p.cols === cols && p.hazards === hazards);
}

export const STARTING_PURSE = 100_000; // $1,000.00
export const CURRENCY = 'USD';

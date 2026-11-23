/**
 * Camera framing for the character slot: full body when the slot is tall enough, waist-up "bust"
 * framing for short portrait strips, hidden when there is no slot. Pure; unit-tested.
 */
export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export type Framing =
  | { readonly mode: 'hidden' }
  | {
      readonly mode: 'full' | 'bust';
      /** Local → stage: stage = origin + local × scale. */
      readonly originX: number;
      readonly originY: number;
      readonly scale: number;
      readonly clip: Rect;
      /** Aim limits (canvas radians) that keep the arm inside the frame. */
      readonly aimMin: number;
      readonly aimMax: number;
    };

const HAT_TOP = -236;
const FULL_SPAN = 244; // hat top to just below the boots
const BUST_BOTTOM = -86; // belt line
/** Local x extent the full-body frame must contain: knock-back stagger behind, aimed revolver in front. */
export const FULL_LEFT = 78;
export const FULL_RIGHT = 98;

export function frameCharacter(slot: Rect | null): Framing {
  if (!slot || slot.w < 48 || slot.h < 48) return { mode: 'hidden' };
  const full = slot.h >= 170 && slot.w / slot.h < 1.8;
  if (full) {
    // Horizontal budget: from the knocked-back coat tail (−LEFT) to the extended gun (+RIGHT).
    const scale = Math.min((slot.h * 0.94) / FULL_SPAN, (slot.w * 0.94) / (FULL_LEFT + FULL_RIGHT));
    const spare = slot.w - (FULL_LEFT + FULL_RIGHT) * scale;
    return {
      mode: 'full',
      scale,
      originX: slot.x + FULL_LEFT * scale + spare * 0.35,
      originY: slot.y + slot.h - 6 * scale,
      clip: slot,
      aimMin: -0.9,
      aimMax: 1.05,
    };
  }
  const span = BUST_BOTTOM - HAT_TOP; // 150 units
  const scale = Math.min((slot.h * 0.98) / span, (slot.w * 0.8) / 170);
  return {
    mode: 'bust',
    scale,
    originX: slot.x + 64 * scale,
    originY: slot.y + 2 - HAT_TOP * scale,
    clip: slot,
    aimMin: -0.5,
    aimMax: 0.55,
  };
}

export function toStage(f: Extract<Framing, { mode: 'full' | 'bust' }>, p: { x: number; y: number }): { x: number; y: number } {
  return { x: f.originX + p.x * f.scale, y: f.originY + p.y * f.scale };
}

/**
 * "Marshal Silas Kane": a procedurally drawn frontier gunslinger (Canvas 2D, no image assets).
 * Worn duster, wide-brim felt hat, oxblood bandana, gun belt and holster, spurred boots and an iron revolver.
 * Warm key light from the upper left, shade on the far side, a thin warm rim. No glow and no neon.
 * Draws in rig-local space; the caller sets the stage transform.
 */
import type { Pose } from './pose';
import type { P, Rig } from './rig';

const C = {
  skin: '#c28a62',
  skinShade: '#93603f',
  stubble: 'rgba(58, 38, 26, 0.38)',
  hat: '#3d2819',
  hatTop: '#4d3421',
  hatShade: '#281910',
  hatBand: '#7a5a2a',
  coat: '#6e4629',
  coatShade: '#4b2e19',
  coatLight: '#8d5d37',
  shirt: '#d8caa9',
  vest: '#35302b',
  vestShade: '#25211d',
  bandana: '#7c2b1f',
  bandanaShade: '#5a1d14',
  trousers: '#4d545e',
  trousersShade: '#383d45',
  boot: '#2a1c13',
  bootLight: '#46301f',
  spur: '#c9a24e',
  belt: '#3a2416',
  brass: '#c9a24e',
  holster: '#5a331b',
  iron: '#3b3937',
  ironLight: '#77726c',
  grip: '#6e4a2b',
  bag: '#b89f74',
  bagShade: '#8a7350',
  rim: 'rgba(244, 206, 150, 0.55)',
  eye: '#1f1510',
} as const;

function limb(g: CanvasRenderingContext2D, a: P, b: P, width: number, color: string, shade?: string): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
  if (shade) {
    // Shade on the side away from the key light.
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    const off = width * 0.22;
    g.strokeStyle = shade;
    g.lineWidth = width * 0.42;
    g.beginPath();
    g.moveTo(a.x + (nx / len) * off, a.y + (ny / len) * off);
    g.lineTo(b.x + (nx / len) * off, b.y + (ny / len) * off);
    g.stroke();
  }
}

function poly(g: CanvasRenderingContext2D, pts: readonly P[], fill: string): void {
  const first = pts[0];
  if (!first) return;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p) g.lineTo(p.x, p.y);
  }
  g.closePath();
  g.fill();
}

function boot(g: CanvasRenderingContext2D, foot: P, spur: boolean): void {
  g.fillStyle = C.boot;
  g.beginPath();
  g.moveTo(foot.x - 8, foot.y - 14);
  g.lineTo(foot.x + 6, foot.y - 14);
  g.quadraticCurveTo(foot.x + 16, foot.y - 4, foot.x + 17, foot.y);
  g.lineTo(foot.x - 10, foot.y);
  g.closePath();
  g.fill();
  g.fillStyle = C.bootLight;
  g.fillRect(foot.x - 8, foot.y - 14, 13, 3);
  g.fillStyle = '#1a110b';
  g.fillRect(foot.x - 10, foot.y - 2, 28, 2); // heel + sole
  if (spur) {
    g.strokeStyle = C.spur;
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(foot.x - 13, foot.y - 4, 3.2, 0, Math.PI * 2);
    g.stroke();
  }
}

function revolver(g: CanvasRenderingContext2D, hand: P, angle: number): void {
  g.save();
  g.translate(hand.x, hand.y);
  g.rotate(angle);
  // barrel + frame
  g.fillStyle = C.iron;
  g.fillRect(0, -5.5, 27, 4.2);
  g.fillStyle = C.ironLight;
  g.fillRect(2, -5.5, 24, 1.2);
  // cylinder
  g.fillStyle = C.iron;
  g.fillRect(-2, -7, 10, 7.5);
  g.fillStyle = C.ironLight;
  g.fillRect(-1, -6.4, 8, 1.4);
  // hammer
  g.fillStyle = C.iron;
  g.fillRect(-5, -8.5, 4, 3);
  // brass trigger guard + wooden grip
  g.strokeStyle = C.brass;
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(3, 1.5, 3, 0, Math.PI);
  g.stroke();
  g.fillStyle = C.grip;
  g.beginPath();
  g.moveTo(-4, -1);
  g.lineTo(1, -1);
  g.lineTo(-1, 9);
  g.lineTo(-7, 8);
  g.closePath();
  g.fill();
  g.restore();
}

function moneyBag(g: CanvasRenderingContext2D, at: P, scale: number): void {
  g.save();
  g.translate(at.x, at.y - 10 * scale);
  g.scale(scale, scale);
  g.fillStyle = C.bag;
  g.beginPath();
  g.ellipse(0, 0, 11, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.bagShade;
  g.beginPath();
  g.ellipse(4, 2, 6, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.bag;
  g.fillRect(-4, -15, 8, 5);
  g.strokeStyle = C.holster;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-5, -11);
  g.lineTo(5, -11);
  g.stroke();
  g.fillStyle = '#5a3a14';
  g.font = '700 12px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('$', -1, 1);
  g.restore();
}

function head(g: CanvasRenderingContext2D, r: Rig, pose: Pose): void {
  g.save();
  g.translate(r.head.x, r.head.y);
  g.rotate(r.headAngle);
  const look = pose.headTurn; // −1 away … +1 toward the board
  // neck
  g.fillStyle = C.skinShade;
  g.fillRect(-4, 6, 9, 10);
  // skull + jaw (3/4 view facing +x)
  g.fillStyle = C.skin;
  g.beginPath();
  g.moveTo(-10, -8);
  g.quadraticCurveTo(-11, 8, -4, 12);
  g.lineTo(5 + look * 2, 13);
  g.quadraticCurveTo(12 + look * 2, 10, 12 + look * 2, 2);
  g.lineTo(14 + look * 3, -1); // nose tip
  g.lineTo(11 + look * 2, -4);
  g.quadraticCurveTo(10, -13, 0, -13);
  g.quadraticCurveTo(-9, -13, -10, -8);
  g.closePath();
  g.fill();
  // far-side shade + stubble along the jaw
  g.fillStyle = C.skinShade;
  g.beginPath();
  g.moveTo(-10, -6);
  g.quadraticCurveTo(-11, 8, -4, 12);
  g.lineTo(-3, 4);
  g.closePath();
  g.fill();
  g.fillStyle = C.stubble;
  g.beginPath();
  g.moveTo(-5, 4);
  g.quadraticCurveTo(-3, 12, 5 + look * 2, 13);
  g.quadraticCurveTo(11 + look * 2, 10, 11 + look * 2, 5);
  g.lineTo(-1, 6);
  g.closePath();
  g.fill();
  // ear
  g.fillStyle = C.skinShade;
  g.beginPath();
  g.ellipse(-5, -1, 2.6, 3.6, 0, 0, Math.PI * 2);
  g.fill();
  // eye: squint narrows it, blink closes it, look shifts it
  const ex = 5 + look * 2.5;
  const open = Math.max(0, 1 - pose.squint * 0.65) * (1 - pose.blink);
  g.fillStyle = C.eye;
  if (open > 0.15) {
    g.beginPath();
    g.ellipse(ex, -4, 1.7, 1.8 * open, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillRect(ex - 2, -4, 4, 1);
  }
  // brow: lowers and angles with the squint
  g.strokeStyle = '#3a2618';
  g.lineWidth = 1.8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(ex - 3, -7.5 + pose.squint * 1.2);
  g.lineTo(ex + 3, -8 + pose.squint * 2);
  g.stroke();
  // mouth: neutral line → lopsided smirk; a gritted grimace when knocked back
  g.strokeStyle = '#5b3524';
  g.lineWidth = 1.4;
  g.beginPath();
  const grit = pose.knock;
  g.moveTo(2 + look, 7.5);
  g.quadraticCurveTo(6 + look * 2, 8 + grit * 1.5 - pose.smirk * 0.6, 9 + look * 2, 6.5 - pose.smirk * 2.2);
  g.stroke();
  // moustache
  g.fillStyle = '#4a2f1d';
  g.beginPath();
  g.moveTo(1 + look, 5.5);
  g.quadraticCurveTo(7 + look * 2, 3.5, 11 + look * 2, 5.8);
  g.quadraticCurveTo(7 + look * 2, 6.6, 1 + look, 6.8);
  g.fill();
  g.restore();
}

function hat(g: CanvasRenderingContext2D, r: Rig): void {
  g.save();
  g.translate(r.hat.x, r.hat.y);
  g.rotate(r.hatAngle);
  // crown with a pinched top
  g.fillStyle = C.hat;
  g.beginPath();
  g.moveTo(-13, 0);
  g.quadraticCurveTo(-14, -14, -8, -18);
  g.quadraticCurveTo(0, -14, 8, -18);
  g.quadraticCurveTo(14, -14, 13, 0);
  g.closePath();
  g.fill();
  g.fillStyle = C.hatTop;
  g.beginPath();
  g.moveTo(-11, -4);
  g.quadraticCurveTo(-12, -14, -8, -16);
  g.quadraticCurveTo(-4, -13, -3, -4);
  g.closePath();
  g.fill();
  // band
  g.fillStyle = C.hatBand;
  g.fillRect(-13, -5, 26, 3.5);
  g.fillStyle = C.brass;
  g.fillRect(6, -5, 3, 3.5);
  // brim: wide, curled at the edges
  g.fillStyle = C.hatShade;
  g.beginPath();
  g.moveTo(-28, 1);
  g.quadraticCurveTo(-30, -5, -24, -3);
  g.quadraticCurveTo(0, 3, 24, -3);
  g.quadraticCurveTo(31, -5, 29, 2);
  g.quadraticCurveTo(0, 8, -28, 1);
  g.closePath();
  g.fill();
  g.strokeStyle = C.rim;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-26, -2);
  g.quadraticCurveTo(-12, 1.5, 0, 1.8);
  g.stroke();
  g.restore();
}

export function drawGunslinger(g: CanvasRenderingContext2D, r: Rig, pose: Pose): void {
  // ground shadow (warm, soft)
  g.fillStyle = 'rgba(20, 10, 4, 0.38)';
  g.beginPath();
  g.ellipse(r.hip.x * 0.4 + 2, 1, 46 + pose.knock * 8, 7, 0, 0, Math.PI * 2);
  g.fill();

  // --- back layer: far leg, far arm, far coat panel
  limb(g, r.hip, r.kneeB, 15, C.trousersShade);
  limb(g, r.kneeB, { x: r.footB.x, y: r.footB.y - 10 }, 13, C.trousersShade);
  boot(g, r.footB, false);

  limb(g, r.shoulderB, r.elbowB, 12, C.coatShade);
  limb(g, r.elbowB, r.handB, 10, C.coatShade);
  g.fillStyle = C.skinShade;
  g.beginPath();
  g.arc(r.handB.x, r.handB.y, 4.6, 0, Math.PI * 2);
  g.fill();
  if (pose.bagRaise > 0.04) moneyBag(g, r.handB, 0.6 + pose.bagRaise * 0.5);

  const sway = pose.coatSway;
  const cos = Math.cos(r.torsoAngle);
  const sin = Math.sin(r.torsoAngle);
  const onTorso = (x: number, y: number): P => ({ x: r.hip.x + x * cos - y * sin, y: r.hip.y + x * sin + y * cos });
  // far coat tail swings with the hips
  poly(g, [onTorso(-12, -66), onTorso(-15, 0), { x: r.hip.x - 22 + sway, y: -30 }, { x: r.hip.x + 2 + sway * 0.6, y: -26 }, onTorso(6, -2)], C.coatShade);

  // --- near leg
  limb(g, r.hip, r.kneeF, 16, C.trousers, C.trousersShade);
  limb(g, r.kneeF, { x: r.footF.x, y: r.footF.y - 10 }, 14, C.trousers, C.trousersShade);
  boot(g, r.footF, true);

  // --- torso: shirt, vest, belt, holster
  poly(g, [onTorso(-11, -70), onTorso(12, -68), onTorso(12, 0), onTorso(-12, 0)], C.vest);
  poly(g, [onTorso(2, -70), onTorso(12, -68), onTorso(12, 0), onTorso(5, 0)], C.vestShade);
  poly(g, [onTorso(-3, -70), onTorso(6, -70), onTorso(2, -52)], C.shirt);
  g.fillStyle = C.brass;
  for (const y of [-46, -34, -22]) {
    const b = onTorso(-1, y);
    g.beginPath();
    g.arc(b.x, b.y, 1.3, 0, Math.PI * 2);
    g.fill();
  }
  // gun belt slung low with cartridge loops and a brass buckle
  const beltA = onTorso(-14, -2);
  const beltB = onTorso(15, 2);
  limb(g, beltA, beltB, 6, C.belt);
  g.fillStyle = C.brass;
  for (let i = 0; i < 5; i++) {
    const t = 0.12 + i * 0.14;
    g.fillRect(beltA.x + (beltB.x - beltA.x) * t - 0.8, beltA.y + (beltB.y - beltA.y) * t - 2.5, 1.6, 4);
  }
  const buckle = onTorso(1, 0);
  g.fillRect(buckle.x - 3.5, buckle.y - 3.5, 7, 7);
  const hol = onTorso(13, 6);
  poly(g, [hol, { x: hol.x + 7, y: hol.y }, { x: hol.x + 5, y: hol.y + 24 }, { x: hol.x - 1, y: hol.y + 24 }], C.holster);
  if (r.holstered) {
    g.fillStyle = C.grip;
    g.fillRect(hol.x - 2, hol.y - 9, 6, 10);
    g.fillStyle = C.iron;
    g.fillRect(hol.x - 3, hol.y - 3, 8, 3);
  }

  // --- near coat panel (open duster) + lapel, swaying
  poly(g, [onTorso(6, -70), onTorso(15, -66), onTorso(16, -4), { x: r.hip.x + 18 + sway, y: -30 }, { x: r.hip.x + 8 + sway * 0.8, y: -27 }, onTorso(10, -10)], C.coat);
  poly(g, [onTorso(6, -70), onTorso(11, -68), onTorso(8, -48)], C.coatLight);
  // rim light down the lit (back) edge of the coat
  g.strokeStyle = C.rim;
  g.lineWidth = 1.2;
  g.beginPath();
  const r0 = onTorso(-12, -66);
  const r1 = onTorso(-15, 0);
  g.moveTo(r0.x, r0.y);
  g.lineTo(r1.x, r1.y);
  g.lineTo(r.hip.x - 22 + sway, -30);
  g.stroke();

  // --- bandana + head + hat
  const n = r.neck;
  poly(g, [{ x: n.x - 9, y: n.y - 2 }, { x: n.x + 10, y: n.y - 3 }, { x: n.x + 4, y: n.y + 10 }], C.bandana);
  poly(g, [{ x: n.x + 2, y: n.y - 2 }, { x: n.x + 10, y: n.y - 3 }, { x: n.x + 4, y: n.y + 10 }], C.bandanaShade);
  head(g, r, pose);
  hat(g, r);

  // --- near (gun) arm on top, the revolver under the hand
  limb(g, r.shoulderF, r.elbowF, 13, C.coat, C.coatShade);
  limb(g, r.elbowF, r.handF, 11, C.coat, C.coatShade);
  if (!r.holstered) revolver(g, r.handF, r.gunAngle);
  g.fillStyle = C.skin;
  g.beginPath();
  g.arc(r.handF.x, r.handF.y, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.skinShade;
  g.beginPath();
  g.arc(r.handF.x + 1.2, r.handF.y + 1.4, 2.6, 0, Math.PI * 2);
  g.fill();
}

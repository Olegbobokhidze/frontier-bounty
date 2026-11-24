/**
 * "Marshal Silas Kane": a procedurally drawn frontier gunslinger (Canvas 2D, no image assets).
 * Forked duster, wide-brim felt hat, oxblood bandana, tin star, leather chaps and gloves, gun belt, spurred
 * boots and an iron revolver whose hammer cocks and cylinder indexes. Three-point lamp lighting: warm key
 * from the board side (front-right), shade on the back, a thin warm rim on the back edge, and the hat brim
 * throwing the classic shadow band across the eyes. No glow and no neon. Draws in rig-local space; the
 * caller sets the stage transform.
 */
import type { Pose } from './pose';
import type { P, Rig } from './rig';

const C = {
  skin: '#c28a62',
  skinLight: '#d39c72',
  skinShade: '#93603f',
  stubble: 'rgba(58, 38, 26, 0.38)',
  brimShadow: 'rgba(48, 24, 12, 0.42)',
  hat: '#3d2819',
  hatTop: '#4d3421',
  hatShade: '#281910',
  hatBand: '#7a5a2a',
  coat: '#86593a',
  coatShade: '#5a3820',
  coatDeep: '#3e2414',
  coatLight: '#a6754c',
  shirt: '#d8caa9',
  vest: '#35302b',
  vestShade: '#25211d',
  bandana: '#7c2b1f',
  bandanaShade: '#5a1d14',
  trousers: '#4d545e',
  trousersShade: '#383d45',
  boot: '#2a1c13',
  bootLight: '#46301f',
  sole: '#1a110b',
  belt: '#3a2416',
  brass: '#c9a24e',
  brassLight: '#e8cf8a',
  tin: '#b9b3a6',
  tinShade: '#7f7a70',
  holster: '#5a331b',
  iron: '#3b3937',
  ironLight: '#77726c',
  ironDark: '#242220',
  grip: '#6e4a2b',
  glove: '#5b3a22',
  gloveLight: '#76502f',
  bag: '#b89f74',
  bagShade: '#8a7350',
  rim: 'rgba(244, 206, 150, 0.55)',
  eye: '#1f1510',
  eyeWhite: '#e9dcc4',
  brow: '#3a2618',
  mouth: '#3a1a12',
  lip: '#5b3524',
  tache: '#4a2f1d',
} as const;

// ------------------------------------------------------------ primitives

/** A tapered limb segment: a quad from width `wa` at `a` to `wb` at `b`, with round caps. */
function taper(g: CanvasRenderingContext2D, a: P, b: P, wa: number, wb: number, fill: string): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(a.x + nx * wa * 0.5, a.y + ny * wa * 0.5);
  g.lineTo(b.x + nx * wb * 0.5, b.y + ny * wb * 0.5);
  // caps bulge outward: from +n anticlockwise through +d (at b), from −n anticlockwise through −d (at a)
  g.arc(b.x, b.y, wb * 0.5, Math.atan2(ny, nx), Math.atan2(ny, nx) - Math.PI, true);
  g.lineTo(a.x - nx * wa * 0.5, a.y - ny * wa * 0.5);
  g.arc(a.x, a.y, wa * 0.5, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) - Math.PI, true);
  g.closePath();
  g.fill();
}

/** Shade strip along the back side of a limb (away from the key light), for volume. */
function shadeLimb(g: CanvasRenderingContext2D, a: P, b: P, wa: number, wb: number, fill: string): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Back side: the normal pointing toward −x for a downward limb.
  const nx = -dy / len;
  const ny = dx / len;
  const sa = wa * 0.24;
  const sb = wb * 0.24;
  taper(g, { x: a.x + nx * sa, y: a.y + ny * sa }, { x: b.x + nx * sb, y: b.y + ny * sb }, wa * 0.46, wb * 0.46, fill);
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

function star(g: CanvasRenderingContext2D, at: P, r: number, rot: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = at.x + Math.cos(a) * rr;
    const y = at.y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
}

function glove(g: CanvasRenderingContext2D, wrist: P, angle: number, closed: boolean): void {
  g.save();
  g.translate(wrist.x, wrist.y);
  g.rotate(angle);
  // gauntlet cuff, then the hand (a fist round the grip, or an open palm)
  g.fillStyle = C.gloveLight;
  g.fillRect(-4.5, -5.2, 5, 10.4);
  g.fillStyle = C.glove;
  g.beginPath();
  if (closed) g.ellipse(3.2, 0.4, 5.2, 4.6, 0, 0, Math.PI * 2);
  else g.ellipse(4.2, 0.6, 6, 3.8, 0.1, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(0, 0, 0, 0.22)';
  g.beginPath();
  g.ellipse(3.6, 2.2, 3.8, 1.8, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function boot(g: CanvasRenderingContext2D, foot: P, near: boolean): void {
  // tall riding boot: shaft, instep, pointed toe, stacked heel
  g.fillStyle = near ? C.boot : '#21160e';
  g.beginPath();
  g.moveTo(foot.x - 8, foot.y - 22);
  g.lineTo(foot.x + 6, foot.y - 22);
  g.lineTo(foot.x + 7, foot.y - 9);
  g.quadraticCurveTo(foot.x + 17, foot.y - 5, foot.x + 19, foot.y - 1);
  g.lineTo(foot.x - 10, foot.y - 1);
  g.lineTo(foot.x - 9, foot.y - 12);
  g.closePath();
  g.fill();
  if (near) {
    g.fillStyle = C.bootLight;
    g.fillRect(foot.x - 8, foot.y - 22, 14, 2.5); // shaft top
    g.fillRect(foot.x + 6, foot.y - 9, 6, 1.6); // toe shine
  }
  g.fillStyle = C.sole;
  g.fillRect(foot.x - 10, foot.y - 2.5, 30, 2.5);
  g.fillRect(foot.x - 10, foot.y - 5, 6, 5); // heel
  if (near) {
    // spur strap and rowel
    g.strokeStyle = C.brass;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(foot.x - 9, foot.y - 7);
    g.lineTo(foot.x - 14, foot.y - 5);
    g.stroke();
    star(g, { x: foot.x - 16, y: foot.y - 5 }, 3.6, foot.x * 0.05, C.brass);
  }
}

function revolver(g: CanvasRenderingContext2D, hand: P, angle: number, hammer: number): void {
  g.save();
  g.translate(hand.x, hand.y);
  g.rotate(angle);
  // barrel + ejector rod + front sight
  g.fillStyle = C.iron;
  g.fillRect(0, -5.5, 27, 4.2);
  g.fillStyle = C.ironDark;
  g.fillRect(4, -1.6, 18, 1.6);
  g.fillStyle = C.ironLight;
  g.fillRect(2, -5.5, 24, 1.1);
  g.fillRect(25, -7, 1.6, 1.6);
  // cylinder: flutes index a chamber as the hammer comes back
  g.fillStyle = C.iron;
  g.fillRect(-2.5, -7.2, 10.5, 8);
  g.fillStyle = C.ironDark;
  const shift = (hammer * 3.4) % 3.4;
  for (let i = 0; i < 4; i++) {
    const x = -2 + ((i * 3.4 + shift) % 10.2);
    g.fillRect(x, -6.6, 1, 6.8);
  }
  g.fillStyle = C.ironLight;
  g.fillRect(-1.5, -6.8, 8.5, 1.2);
  // hammer: rocks back when cocked
  g.save();
  g.translate(-3, -6.5);
  g.rotate(-hammer * 0.7);
  g.fillStyle = C.iron;
  g.fillRect(-3, -3.5, 3.4, 4.2);
  g.restore();
  // brass trigger guard + walnut grip with a brass butt cap
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
  g.fillStyle = C.brass;
  g.fillRect(-7, 7.6, 6.4, 1.6);
  g.restore();
}

function moneyBag(g: CanvasRenderingContext2D, at: P, scale: number, spin: number): void {
  g.save();
  g.translate(at.x, at.y - 10 * scale);
  g.rotate(spin);
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

// ------------------------------------------------------------ head & hat

function facePath(g: CanvasRenderingContext2D, look: number): void {
  g.beginPath();
  g.moveTo(-10, -8);
  g.quadraticCurveTo(-11, 8, -4, 12);
  g.lineTo(5 + look * 2, 13.5);
  g.quadraticCurveTo(12 + look * 2, 10.5, 12 + look * 2, 2);
  g.lineTo(14.5 + look * 3, -1); // nose tip
  g.lineTo(11 + look * 2, -4);
  g.quadraticCurveTo(10, -13, 0, -13);
  g.quadraticCurveTo(-9, -13, -10, -8);
  g.closePath();
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
  facePath(g, look);
  g.fill();

  g.save();
  facePath(g, look);
  g.clip();
  // key light on the cheek and nose bridge (front-right)
  g.fillStyle = C.skinLight;
  g.beginPath();
  g.ellipse(8 + look * 2, 1, 4.5, 6, 0.2, 0, Math.PI * 2);
  g.fill();
  // back-of-head shade
  g.fillStyle = C.skinShade;
  g.beginPath();
  g.moveTo(-11, -9);
  g.quadraticCurveTo(-12, 9, -4, 13);
  g.lineTo(-3, 3);
  g.lineTo(-5, -9);
  g.closePath();
  g.fill();
  // stubble along the jaw
  g.fillStyle = C.stubble;
  g.beginPath();
  g.moveTo(-5, 4);
  g.quadraticCurveTo(-3, 13, 5 + look * 2, 13.5);
  g.quadraticCurveTo(11 + look * 2, 10.5, 11 + look * 2, 5);
  g.lineTo(-1, 6);
  g.closePath();
  g.fill();
  // the hat brim's shadow band across the eyes; it lifts with the hat
  const shadowTo = -1.5 - pose.hatLift * 16 + pose.hatTip * 8;
  g.fillStyle = C.brimShadow;
  g.fillRect(-14, -16, 32, Math.max(0, shadowTo + 16));
  g.restore();

  // ear
  g.fillStyle = C.skinShade;
  g.beginPath();
  g.ellipse(-5, -1, 2.6, 3.6, 0, 0, Math.PI * 2);
  g.fill();

  // eye: squint narrows it, blink closes it, surprise opens it wide; the pupil leads the gaze
  const ex = 5 + look * 2.5;
  const wide = Math.max(0, pose.brow) * (1 - pose.squint);
  const open = Math.max(0, 1 - pose.squint * 0.7 + wide * 0.5) * (1 - pose.blink);
  if (open > 0.15) {
    if (wide > 0.35) {
      g.fillStyle = C.eyeWhite;
      g.beginPath();
      g.ellipse(ex, -4, 2.6, 2.2 * open, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = C.eye;
    g.beginPath();
    g.ellipse(ex + pose.eyeX * 0.7, -4 + pose.eyeY * 0.6, 1.7, Math.min(1.8, 1.8 * open), 0, 0, Math.PI * 2);
    g.fill();
    // catch-light so the eye reads alive even in the brim shadow
    g.fillStyle = 'rgba(255, 236, 200, 0.85)';
    g.fillRect(ex + pose.eyeX * 0.7 + 0.3, -4.9 + pose.eyeY * 0.6, 0.9, 0.9);
  } else {
    g.fillStyle = C.eye;
    g.fillRect(ex - 2, -4, 4, 1);
  }
  // brow: drops and pinches toward the nose when furrowed, arches when surprised
  const browY = -7.6 - pose.brow * 1.8 + pose.squint * 1.1;
  const inner = Math.min(0, pose.brow) * -1.6;
  g.strokeStyle = C.brow;
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(ex - 3.2, browY - Math.max(0, pose.brow) * 0.6);
  g.quadraticCurveTo(ex, browY - 0.8 - Math.max(0, pose.brow) * 0.8, ex + 3.2, browY + inner);
  g.stroke();

  // mouth: open shout/whoop, otherwise a lopsided smirk or a gritted line
  const mx = 6 + look * 2;
  if (pose.mouth > 0.08) {
    g.fillStyle = C.mouth;
    g.beginPath();
    g.ellipse(mx, 8.6, 2.6, 0.6 + pose.mouth * 2.8, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    g.strokeStyle = C.lip;
    g.lineWidth = 1.4;
    g.beginPath();
    const grit = pose.knock;
    g.moveTo(2 + look, 7.5);
    g.quadraticCurveTo(6 + look * 2, 8 + grit * 1.5 - pose.smirk * 0.6, 9 + look * 2, 6.5 - pose.smirk * 2.2);
    g.stroke();
  }
  // horseshoe moustache
  g.fillStyle = C.tache;
  g.beginPath();
  g.moveTo(1 + look, 5.5);
  g.quadraticCurveTo(7 + look * 2, 3.4, 11.5 + look * 2, 5.6);
  g.lineTo(11 + look * 2, 9.5 + pose.mouth);
  g.lineTo(9.6 + look * 2, 9.6 + pose.mouth);
  g.quadraticCurveTo(9 + look * 2, 6.6, 6 + look * 2, 6.8);
  g.quadraticCurveTo(3 + look, 6.8, 1 + look, 7);
  g.closePath();
  g.fill();
  g.restore();
}

function hat(g: CanvasRenderingContext2D, r: Rig): void {
  g.save();
  g.translate(r.hat.x, r.hat.y);
  g.rotate(r.hatAngle);
  // crown with a pinched cattleman crease
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
  g.moveTo(3, -2);
  g.quadraticCurveTo(12, -12, 8, -16.5);
  g.quadraticCurveTo(12, -12, 12, -2);
  g.closePath();
  g.fill();
  g.fillStyle = C.hatShade;
  g.beginPath();
  g.moveTo(-11, -3);
  g.quadraticCurveTo(-12, -14, -8, -16);
  g.quadraticCurveTo(-6, -10, -6, -3);
  g.closePath();
  g.fill();
  // band + brass concho
  g.fillStyle = C.hatBand;
  g.fillRect(-13, -5, 26, 3.5);
  g.fillStyle = C.brass;
  g.beginPath();
  g.arc(8, -3.2, 1.9, 0, Math.PI * 2);
  g.fill();
  // brim: wide, curled at the edges, lit along its top edge
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
  g.moveTo(2, 2);
  g.quadraticCurveTo(16, 0.6, 26, -3.4);
  g.stroke();
  g.restore();
}

// ------------------------------------------------------------ body

export function drawGunslinger(g: CanvasRenderingContext2D, r: Rig, pose: Pose): void {
  const sway = pose.coatSway;
  const cos = Math.cos(r.torsoAngle);
  const sin = Math.sin(r.torsoAngle);
  const onTorso = (x: number, y: number): P => ({ x: r.hip.x + x * cos - y * sin, y: r.hip.y + x * sin + y * cos });

  // ground shadow: tightens as he crouches, smears back with the knock
  const lift = Math.max(0, -100 - r.hip.y) / 40;
  g.fillStyle = 'rgba(20, 10, 4, 0.38)';
  g.beginPath();
  g.ellipse(r.hip.x * 0.4 + 2 - pose.knock * 6, 1, 44 + pose.knock * 10 - lift * 4, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(20, 10, 4, 0.32)';
  for (const f of [r.footB, r.footF]) {
    g.beginPath();
    g.ellipse(f.x + 4, 0.5, 15, 2.6, 0, 0, Math.PI * 2);
    g.fill();
  }

  // --- back coat tail (behind everything), swings late with the hips
  poly(g, [onTorso(-12, -66), onTorso(-16, 0), { x: r.hip.x - 24 + sway * 1.1, y: -26 }, { x: r.hip.x - 2 + sway * 0.7, y: -30 }, onTorso(4, -2)], C.coatDeep);

  // --- far leg
  taper(g, r.hip, r.kneeB, 16, 13, C.trousersShade);
  taper(g, r.kneeB, { x: r.footB.x, y: r.footB.y - 12 }, 13, 11, C.trousersShade);
  boot(g, r.footB, false);

  // --- off arm, back layer (the upper arm always; the forearm too unless the hand is out front)
  const handFront = pose.backArm > 0.35 || pose.brim > 0.3 || pose.brush > 0.3 || pose.bagRaise > 0.35;
  const drawOffForearm = () => {
    taper(g, r.elbowB, r.handB, 11, 9, handFront ? C.coat : C.coatShade);
    if (handFront) shadeLimb(g, r.elbowB, r.handB, 11, 9, C.coatShade);
    glove(g, r.handB, Math.atan2(r.handB.y - r.elbowB.y, r.handB.x - r.elbowB.x), pose.bagRaise > 0.3);
    if (pose.bagRaise > 0.04) moneyBag(g, r.bag, 0.6 + pose.bagRaise * 0.5, pose.bagToss * 0.9);
  };
  taper(g, r.shoulderB, r.elbowB, 13, 11, C.coatShade);
  if (!handFront) drawOffForearm();

  // --- torso: shirt, vest, star, belt, holster
  poly(g, [onTorso(-12, -70), onTorso(13, -68), onTorso(12, 0), onTorso(-12, 0)], C.vest);
  poly(g, [onTorso(-12, -70), onTorso(-5, -70), onTorso(-6, 0), onTorso(-12, 0)], C.vestShade);
  poly(g, [onTorso(-3, -71), onTorso(7, -71), onTorso(2, -50)], C.shirt);
  g.fillStyle = C.brass;
  for (const y of [-44, -32, -20]) {
    const b = onTorso(2, y);
    g.beginPath();
    g.arc(b.x, b.y, 1.2, 0, Math.PI * 2);
    g.fill();
  }
  // the marshal's tin star, catching the lamp
  const badge = onTorso(8, -52);
  star(g, { x: badge.x + 0.6, y: badge.y + 0.8 }, 5, r.torsoAngle, C.tinShade);
  star(g, badge, 5, r.torsoAngle, C.tin);
  g.fillStyle = C.brassLight;
  g.fillRect(badge.x - 0.6, badge.y - 2.6, 1.2, 1.2);
  // gun belt slung low with cartridge loops and a brass buckle
  const beltA = onTorso(-14, -2);
  const beltB = onTorso(15, 2);
  taper(g, beltA, beltB, 6, 6, C.belt);
  g.fillStyle = C.brass;
  for (let i = 0; i < 6; i++) {
    const t = 0.1 + i * 0.12;
    g.fillRect(beltA.x + (beltB.x - beltA.x) * t - 0.8, beltA.y + (beltB.y - beltA.y) * t - 2.5, 1.6, 4);
  }
  const buckle = onTorso(1, 0);
  g.fillRect(buckle.x - 3.5, buckle.y - 3.5, 7, 7);
  g.fillStyle = C.belt;
  g.fillRect(buckle.x - 1.8, buckle.y - 1.8, 3.6, 3.6);

  // --- near leg: blue-grey trousers (cool against the warm duster), boot and spur
  taper(g, r.hip, r.kneeF, 17, 14, C.trousers);
  taper(g, r.kneeF, { x: r.footF.x, y: r.footF.y - 12 }, 14, 12, C.trousers);
  shadeLimb(g, r.hip, r.kneeF, 17, 14, C.trousersShade);
  shadeLimb(g, r.kneeF, { x: r.footF.x, y: r.footF.y - 12 }, 14, 12, C.trousersShade);
  // a lit crease down the front of the shin
  g.strokeStyle = 'rgba(160, 172, 186, 0.35)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(r.kneeF.x + 4, r.kneeF.y + 2);
  g.lineTo(r.footF.x + 4, r.footF.y - 16);
  g.stroke();
  boot(g, r.footF, true);

  // holster on the near hip, over the chaps
  const hol = onTorso(13, 6);
  poly(g, [hol, { x: hol.x + 7, y: hol.y }, { x: hol.x + 5, y: hol.y + 24 }, { x: hol.x - 1, y: hol.y + 24 }], C.holster);
  g.fillStyle = 'rgba(0, 0, 0, 0.25)';
  g.fillRect(hol.x + 3.5, hol.y + 2, 2, 21);
  if (r.holstered) {
    g.fillStyle = C.grip;
    g.fillRect(hol.x - 2, hol.y - 9, 6, 10);
    g.fillStyle = C.brass;
    g.fillRect(hol.x - 2, hol.y - 9, 6, 1.4);
    g.fillStyle = C.iron;
    g.fillRect(hol.x - 3, hol.y - 3, 8, 3);
  }

  // --- near coat panel (open duster) + lapel + front tail, swaying
  poly(g, [onTorso(6, -71), onTorso(16, -66), onTorso(17, -4), { x: r.hip.x + 20 + sway, y: -30 }, { x: r.hip.x + 8 + sway * 0.8, y: -27 }, onTorso(10, -10)], C.coat);
  poly(g, [onTorso(13, -60), onTorso(17, -58), onTorso(17, -4), { x: r.hip.x + 20 + sway, y: -30 }, { x: r.hip.x + 16 + sway * 0.9, y: -29 }], C.coatShade);
  poly(g, [onTorso(6, -71), onTorso(12, -69), onTorso(8, -46)], C.coatLight);
  // shoulder yoke for mass across the back
  poly(g, [onTorso(-13, -72), onTorso(9, -73), onTorso(11, -64), onTorso(-14, -62)], C.coat);
  // rim light along the back of the shoulders and torso (the lamp behind him), fading out at the hip
  const r0 = onTorso(-13, -70);
  const r1 = onTorso(-15, -8);
  const rimGrad = g.createLinearGradient(r0.x, r0.y, r1.x, r1.y);
  rimGrad.addColorStop(0, C.rim);
  rimGrad.addColorStop(1, 'rgba(244, 206, 150, 0)');
  g.strokeStyle = rimGrad;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(r0.x, r0.y);
  g.lineTo(r1.x, r1.y);
  g.stroke();

  // --- bandana (knot tails swing with the coat) + head + hat
  const n = r.neck;
  poly(g, [{ x: n.x - 9, y: n.y - 2 }, { x: n.x + 10, y: n.y - 3 }, { x: n.x + 4, y: n.y + 10 }], C.bandana);
  poly(g, [{ x: n.x + 2, y: n.y - 2 }, { x: n.x + 10, y: n.y - 3 }, { x: n.x + 4, y: n.y + 10 }], C.bandanaShade);
  poly(g, [{ x: n.x - 8, y: n.y - 2 }, { x: n.x - 12 + sway * 0.3, y: n.y + 7 }, { x: n.x - 7 + sway * 0.25, y: n.y + 5 }], C.bandanaShade);
  head(g, r, pose);
  hat(g, r);

  // --- off forearm out front when it shields the face, touches the hat, brushes the coat or holds the purse
  if (handFront) drawOffForearm();

  // --- near (gun) arm on top, the revolver under the gloved hand
  taper(g, r.shoulderF, r.elbowF, 14, 12, C.coat);
  shadeLimb(g, r.shoulderF, r.elbowF, 14, 12, C.coatShade);
  taper(g, r.elbowF, r.handF, 12, 10, C.coat);
  shadeLimb(g, r.elbowF, r.handF, 12, 10, C.coatShade);
  if (!r.holstered) revolver(g, r.handF, r.gunAngle, pose.hammer);
  glove(g, r.handF, Math.atan2(r.handF.y - r.elbowF.y, r.handF.x - r.elbowF.x), !r.holstered);
}

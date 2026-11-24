# Frontier Dynamite & Bounty

**Created by Oleg Bobokhidze.**

A Western-themed, deterministic grid game. Stake a claim, dig for bounty, and cash out before you hit the dynamite.
It is built to show provider-grade frontend engineering: a pure round state machine, shared spatial maths,
a provably-fair provider contract, an accessible DOM + Canvas board, and a live Provider Inspector.

```bash
pnpm install
pnpm dev        # http://localhost:5174 · Space = stake/cash out · arrows + Enter = dig · ` = inspector
```

## Architecture

```
core/      generic table-driven Machine (allow-list + pure reducer + effects + transition log), clock, rng, money
engine/
  spatial/ cell⇄index, neighbours, keyboard moves, fitLayout + hitTest, AABB / circle (peg collision)
  bounty/  rules & multiplier model, hazard placement, 8-state round machine, controller, ports
adapters/  MockProvider (provably fair, latency/faults, idempotent), HttpProvider, verifyRound
config/    territory presets, game-mode registry (Plinko registered as "planned"), palette, timings
audio/     synthesized wood / brass / fuse / blast / register cues, safe fallback
board/     DOM grid from GridLayout + Canvas 2D FX layer, BoardPort (animation gating)
  scene/   Marshal Silas Kane: keyframed + procedural character animation, FK/IK rig, gaze, shot/impact/BOOM FX (ADR-0006/0007)
ui/        ledger HUD, ladder, posters, rules, Provider Inspector, App composition
```

Lower layers never import upper ones. ESLint enforces this, and also bans `enum` and `interface`.

### Round lifecycle

`IDLE → CONFIGURING → ROUND_ACTIVE ⇄ REVEALING_STEP → CASHING_OUT → ROUND_OVER_WIN | ROUND_OVER_BUST`, plus `ERROR_RECOVERABLE`.

- Only one reveal can be in flight. Clicks during a reveal are **rejected and logged**, never queued.
- A step settles only after **both** the server answer and the flip animation finish.
- Every request has a `requestId`. Stale and duplicate answers are discarded. Retries reuse the id and are idempotent server-side.

### Character & FX

A procedurally drawn gunslinger (no image assets) breathes, shifts his weight and, left alone, tugs his hat brim or squints
down the street. He watches the claim you hover or focus: eyes first, then the head, and the barrel too once his gun is up.
Brass sight brackets close in on that lid. On a pick he cocks, draws and aims at the exact cell, then fires (muzzle flash,
tracer, shell casing, a curl of barrel smoke). The lid flips only when the bullet lands, and the badge is stamped on as it lands.
A bounty gets a nod and a twirl into the holster, and every third claim in a row earns a double twirl and a tip of the hat.
A lit fuse sputters and rattles its lid while his eyes go wide. Then the BOOM: a heat flash, fireball, shockwaves, splinters,
clods, embers, scorch, smoke and a smouldering crater. Neighbouring lids are kicked away, the camera shakes, and he is thrown
back for a beat of hit-stop. He dusts off his duster, slaps his hat back on and glares at the board. The end-of-round sweep
ripples out from the cell that decided it. Cashing out tosses the purse, rains coins that bounce on the board and counts the
purse up. Where he stands (beside the board, in a strip above it, or off-screen) is computed from the stage size (ADR-0007).
Inspector → *Character & FX* previews every clip.

### Provably fair

`hazards = placeHazards(seed(SHA-256(serverSeed:clientSeed:nonce)))`. The server shows `SHA-256(serverSeed)` before the
round and reveals the seed afterwards. **Verify round** in the Inspector re-derives the layout. QA-forced outcomes are
detected as tampering.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server (`--host` to test on a phone over LAN) |
| `pnpm verify` | typecheck → lint (architecture rules) → tests → production build |
| `pnpm e2e` | Puppeteer smoke test (44 checks: character beats, gaze, blast jolt, gameplay, faults, fairness, perf, 6 viewports). Needs `pnpm dev` running. Env: `BASE_URL`, `CHROME_PATH`, `E2E_GPU=0` |
| `pnpm log:decision -- …` | Append a timestamped decision to `docs/ai/decision-log.jsonl` |
| `pnpm report:new -- <slug>` | Create a session report from the template |

URL params: `?inspector=1` · `?preset=deadwood` · `?clientSeed=my-seed`

## Deploy (separate link)

The build uses a relative base (`./`), so the same `dist/` works on any host.

- **Netlify**: import the repo. [`netlify.toml`](netlify.toml) sets the build command and the `dist` folder.
- **Vercel**: import the repo. [`vercel.json`](vercel.json) is picked up automatically.
- **GitHub Pages**: Settings → Pages → Source: *GitHub Actions*, then run
  [`Deploy to GitHub Pages`](.github/workflows/deploy-pages.yml) from the Actions tab. It runs `pnpm verify` first.

## Decision tracking

[`AGENTS.md`](AGENTS.md) · [`docs/decisions/`](docs/decisions/) (ADR-0001…0005) ·
[`docs/ai/decision-log.jsonl`](docs/ai/decision-log.jsonl) · [`docs/ai/reports/`](docs/ai/reports/)

## Author

Designed and built by **Oleg Bobokhidze**. © 2026 Oleg Bobokhidze. All rights reserved.

## Sharing and SEO

Links to the deployed game unfurl as a large preview card on WhatsApp, Telegram, Facebook, LinkedIn,
Slack, Discord and X.

- `public/og-image.jpg`: the 1200×630 share card (a live screenshot plus themed copy).
- `share-meta.ts`: a Vite plugin. It reads the title and description from `index.html` and injects
  Open Graph, Twitter/X, canonical and JSON-LD (`VideoGame`) tags. It also writes `robots.txt` and
  `sitemap.xml`.
- Previews need absolute image URLs, so build with the public address:
  `SITE_URL=https://your-domain/ pnpm build`. Netlify (`URL`) and Vercel (`VERCEL_PROJECT_PRODUCTION_URL`)
  provide it automatically.
- After visible UI changes, regenerate the card and icons with `pnpm dev`, then `pnpm share:assets`.
  Copy, palette and crop live in `scripts/share-card.json`.
- Check a deployed link with the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
  or [opengraph.xyz](https://www.opengraph.xyz/).

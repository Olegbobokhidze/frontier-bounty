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
  scene/   Marshal Silas Kane: keyframed + procedural character animation, FK rig, shot/impact/BOOM FX (ADR-0006)
ui/        ledger HUD, ladder, posters, rules, Provider Inspector, App composition
```

Lower layers never import upper ones. ESLint enforces this, and also bans `enum` and `interface`.

### Round lifecycle

`IDLE → CONFIGURING → ROUND_ACTIVE ⇄ REVEALING_STEP → CASHING_OUT → ROUND_OVER_WIN | ROUND_OVER_BUST`, plus `ERROR_RECOVERABLE`.

- Only one reveal can be in flight. Clicks during a reveal are **rejected and logged**, never queued.
- A step settles only after **both** the server answer and the flip animation finish.
- Every request has a `requestId`. Stale and duplicate answers are discarded. Retries reuse the id and are idempotent server-side.

### Character & FX

A procedurally drawn gunslinger (no image assets) idles with breathing, weight shift and glances. On a pick he draws,
aims at the exact cell, fires (muzzle flash, tracer, shell casing), and the lid flips only when the bullet lands. A bounty gets a
nod, a revolver twirl and a holster. Dynamite triggers a layered BOOM (flash, fireball, shockwave, embers, debris, smoke, ash and a
camera shake), and the marshal flinches and recovers. Cashing out raises the purse. Inspector → *Character & FX* previews every clip.

### Provably fair

`hazards = placeHazards(seed(SHA-256(serverSeed:clientSeed:nonce)))`. The server shows `SHA-256(serverSeed)` before the
round and reveals the seed afterwards. **Verify round** in the Inspector re-derives the layout. QA-forced outcomes are
detected as tampering.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server (`--host` to test on a phone over LAN) |
| `pnpm verify` | typecheck → lint (architecture rules) → tests → production build |
| `pnpm e2e` | Puppeteer smoke test (40 checks: character beats, gameplay, faults, fairness, perf, 6 viewports). Needs `pnpm dev` running. Env: `BASE_URL`, `CHROME_PATH`, `E2E_GPU=0` |
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

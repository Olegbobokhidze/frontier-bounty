# AGENTS.md: Operating Guide for AI Coding Agents

Frontier Dynamite & Bounty, created by **Oleg Bobokhidze**.
Read this whole file before your first edit in a session.

---

## 1. Mandatory workflow before editing

1. **Read every ADR** in [`docs/decisions/`](docs/decisions/). `Accepted` ADRs are binding. To change direction,
   write a new ADR that supersedes the old one (§5). Never silently diverge.
2. **Read the recent log**: `tail -n 20 docs/ai/decision-log.jsonl` (newest last).
3. **Read the latest session report**: `ls docs/ai/reports/ | sort | tail -n 2`. Its *Known limitations* and
   *Next steps* sections are the backlog.
4. **Run the baseline**: `pnpm verify` must pass before you change anything. If it doesn't, report it first.

## 2. Repository structure and layer boundaries

```
src/
  core/      generic infra: table-driven machine runner, transition log, clock, rng, money, results
  engine/
    spatial/ coordinate maths: cell⇄index, neighbours, hit-testing, Vec2/AABB (shared by all spatial modes)
    bounty/  the grid game: config types, multiplier math, hazard placement, state machine, controller, ports
  adapters/  RoundProvider implementations: MockProvider (provably-fair, latency, faults), HttpProvider
  config/    theme tokens, grid/hazard presets, bet ladder
  audio/     synthesized Web Audio cues (wood, brass, fuse, blast), safe fallback
  board/     React DOM grid + Canvas FX layer (dust, sparks, debris), hit-testing, animations
  ui/        HUD, drawers, modals, Provider Inspector, App composition
```

| Layer | May import | Must NOT import |
|---|---|---|
| `core`, `engine` | each other (engine → core) | React, DOM globals, `adapters`, `board`, `ui`, `audio`, `config` |
| `adapters`, `audio`, `config` | `core`, `engine` | React, `board`, `ui` |
| `board` | `core`, `engine`, `config` | `ui`, `adapters` |
| `ui` | everything | — |

ESLint enforces these rules (`eslint.config.js`). Do not disable them. Change them through an ADR.

**Adding a spatial mode** (for example Plinko): create `src/engine/<mode>/` that reuses `core/machine` and
`engine/spatial`, a `RoundProvider`-style port, a board under `src/board/<mode>/`, and register it in `src/config/modes.ts`.
See ADR-0002.

## 3. Coding standards

- Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **No `enum`, no `interface`.** Use `const X = { … } as const` + `type X = (typeof X)[keyof typeof X]`, and `type` aliases.
- Results cross boundaries as discriminated unions (`{ ok: true, … } | { ok: false, error }`). Providers never throw.
- Engine code is pure. Inject time (`Clock`) and randomness (`Rng`), and never call `Math.random()` or `Date.now()` there.
- Money is integer minor units (cents). Multipliers are stored as numbers and rounded only when converted to money.
- CSS: even integer-pixel line heights from `src/ui/styles/tokens.css`. Primary actions in modals and drawers are right-aligned.
- Animate only `transform` and `opacity`. No layout properties in animations.
- Theme: Western frontier (timber, brass, iron, leather, parchment). **No neon or glow aesthetics.**
- Every engine behaviour needs a Vitest test next to it (`*.test.ts`).
- Commits: imperative, ≤72 chars, scoped (`engine:`, `board:`, `ui:`, `docs:` …).

## 4. Recording decisions (timestamped)

For every meaningful choice (library, data shape, state transition, public API, perf or UX trade-off):

```bash
pnpm log:decision -- --actor agent --area engine/state-machine \
  --decision "…" --rationale "…" --files src/engine/bounty/machine.ts --tradeoffs "…"
```

The script validates the fields and appends one JSONL line with an ISO-8601 UTC `timestamp`.
The log is **append-only**: never edit or delete earlier lines. To reverse a decision, append a new entry.

## 5. When to write an ADR

Write `docs/decisions/ADR-XXXX-kebab-title.md` (copy `ADR-TEMPLATE.md`, next free number) when you
change a layer boundary or a port contract (`RoundProvider`, `BoardPort`, `GameMode`), add or remove a runtime
dependency, or supersede an ADR. In that last case, mark the old one `Superseded by ADR-XXXX`; that's the only allowed edit.
Also add a log entry that points to the new ADR.

## 6. End-of-session report (mandatory)

```bash
pnpm report:new -- <slug>     # docs/ai/reports/YYYY-MM-DD-<slug>.md
```

Fill in every section: summary, completed work, timestamped decisions, **verification with real command output**,
known limitations, next steps. Never claim a check you didn't run.

## 7. Verification

```bash
pnpm verify      # typecheck → lint (architecture rules) → tests → build
pnpm dev         # http://localhost:5174 · ` (backtick) opens the Inspector
pnpm e2e         # with pnpm dev running. Env: BASE_URL, CHROME_PATH
```

UI, board or state-flow changes must also pass `pnpm e2e`.

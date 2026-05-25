# Epic Mode (preview): activation gate and `/swarm epic`

## What changed

- Epic Mode is now a usable, opt-in execution mode (Capability C). When
  enabled per session, the architect calls `epic_run_phase(phase)` —
  instead of `lean_turbo_run_phase(phase)` — to dispatch a phase. The
  tool computes the plan-wide coupling coefficient `p`, gates promotion
  on three independent checks (p-threshold, hot-module, greenfield), and
  either invokes `LeanTurboRunner` for parallel execution (when
  promoted) or returns a structured "serial" verdict for the caller to
  fall back on.
- New module surface in `src/turbo/epic/`:
  - `state.ts` — durable per-session state at `.swarm/epic-state.json`
    (atomic `tmp + rename`, per-directory fail-closed marker, mirrors
    the lean-turbo state shape *without* sharing its file).
  - `activation.ts` — the pure `decideEpicActivation(tasks, pairs,
    commitsObserved, options)` function. Returns
    `{ decision: 'promote' | 'demote', p, rationale, blockingReasons }`.
  - `promotion-evidence.ts` — append-only JSONL writer for
    `.swarm/evidence/epic-promotions.jsonl`. Read-tolerant of partial
    trailing-line writes.
- New tool `epic_run_phase` (`src/tools/epic-run-phase.ts`) that wires
  the above together: verify mode active, load plan, resolve task
  scopes, compute the verdict, append evidence, record session
  decision, dispatch into `LeanTurboRunner` or short-circuit serial.
- New slash command `/swarm epic` with subcommands `on / off / status /
  decide`. Bare `/swarm epic` toggles. `decide` is a read-only what-if
  that runs the decision and prints the rationale without dispatching
  or writing evidence.
- New `turbo.epic.mode.*` config block (defaults: `enabled: false`,
  `activation_threshold: 0.3`, `min_commits_for_signal: 20`). Added
  to the existing `EpicConfigSchema`.
- New tool registered the project's standard way: export from
  `src/tools/index.ts`, registered in the plugin `tool: {}` block in
  `src/index.ts`, entry in `TOOL_NAMES` (`src/tools/tool-names.ts`) and
  `AGENT_TOOL_MAP` + description map (`src/config/constants.ts`).
- 60 new tests covering the durable state (atomic write, fail-closed,
  enable/disable round-trip, decision recording), the activation logic
  across the three gates (each gate individually + combined-failure +
  edge cases), the promotion-evidence writer (append, read, malformed
  line tolerance, error path), the tool integration (failure modes,
  demotion path, promotion path, per-plan decision aggregation), and
  the slash command (session validation, on/off/toggle, status, decide).

## Why

Capabilities A and B gave us a measured coupling signal and a way to
see it. Capability C is what turns those measurements into a
decision: per plan, *should* this work be parallel at all? The brief's
"default serial, promote on proof" rule (§4.2) becomes operational —
parallel execution requires positive evidence on every gate, not just
absence of failure.

## Migration steps

None. With `turbo.epic.mode.enabled` left at its default (`false`), no
Epic-mode runtime code runs. The `epic_run_phase` tool registers as a
normal tool but is never invoked unless the architect explicitly calls
it. Existing modes (Lean Turbo, Turbo, Full-Auto, standard serial)
behave exactly as before.

## Breaking changes

- None. All schema additions are optional fields with safe defaults.
  All registry / TOOL_NAMES additions are purely additive.

## Known caveats

- **Decision dispatching is manual today.** The architect must
  explicitly call `epic_run_phase` instead of `lean_turbo_run_phase`
  when Epic Mode is on; there's no system-enhancer hook injecting that
  guidance into the architect's prompt yet. That auto-wiring is a
  future capability (likely M4 territory) and was deliberately left out
  of M3 to keep this PR scoped to "activation-only" (per the M3
  re-scoping decisions in `NOTES-repo-findings.md` §18).
- **No new degradation tier.** When Epic Mode promotes, individual
  task degradation inside each phase is still handled by Lean Turbo's
  existing per-task logic — unchanged. Epic Mode never adds new
  per-task decisions.
- **Defaults are reasoned estimates, not measured optima.** The
  `activation_threshold: 0.3` and `min_commits_for_signal: 20` defaults
  flow from the brief's "conservative" framing; they have not been
  tuned against production outcomes.
- **No telemetry-fed learning yet.** The evidence file is an audit
  trail, not a feedback loop. Outcome-based self-calibration is M4's
  scope; M3 does not consume the evidence it writes.

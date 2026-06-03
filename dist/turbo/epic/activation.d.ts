/**
 * Epic Mode activation decision (Capability C).
 *
 * `decideEpicActivation(...)` is the pure heart of M3: given a plan, a
 * co-change pair list, and the activation thresholds, it returns a
 * structured `promote | demote` verdict with the rationale fields a
 * caller can persist for audit. Pure function — no I/O.
 *
 * Three independent gates must all pass for promotion:
 *
 *   1. **p-threshold gate.** Compute the coupling coefficient `p` over
 *      the plan's task graph using Capability A's `epicPairConflict` (via
 *      Capability B's `computeCouplingReport`). Promote only when
 *      `p <= activation_threshold`.
 *
 *   2. **Hot-module gate.** No task in scope may touch a Lean Turbo
 *      "global" or "protected" path — these are the same lists Lean
 *      Turbo already maintains (reused by import; not duplicated).
 *      Touching a hot module forces serial regardless of `p`.
 *
 *   3. **Greenfield gate.** If the co-change history is sparse (fewer
 *      than `min_commits_for_signal` distinct commits across the
 *      analyzer output), the signal is too weak to trust per brief §4.2's
 *      greenfield rule. Force serial.
 *
 * Default-serial-promote-on-proof (brief §4.2): when any gate fails or
 * the data is missing, the decision is `demote`. Promotion requires
 * positive evidence on every gate.
 */
import type { CoChangeEntry } from '../../tools/co-change-analyzer.js';
import type { CouplingTask } from './coupling-report.js';
/** Thresholds the caller supplies (typically derived from EpicConfigSchema). */
export interface EpicActivationOptions {
    /** Plan-wide p ceiling. Plans with p > activationThreshold are demoted. */
    activationThreshold: number;
    /** Greenfield floor on the analyzer's commit window. */
    minCommitsForSignal: number;
    /** NPMI floor for the co-change conflict signal — passed through to coupling. */
    cochangeNpmiThreshold: number;
    /** Minimum raw co-change count for the conflict signal. */
    cochangeMinCoChanges: number;
    /**
     * Capability D (calibration) additions to the hot-module list. The static
     * Lean Turbo predicates (`isGlobalFile` / `isProtectedPath`) always apply;
     * these are normalised paths the calibration loop has promoted after
     * observing divergent writes against the static set. Optional — falsy or
     * empty means "no calibration overrides". Path matching is exact (post-
     * `normalizePath`); callers compute that via `effectiveHotModules` in
     * `./calibration-engine.ts`.
     */
    extraHotModules?: readonly string[];
    /**
     * Greenfield-smart Rule 1: whether the project is under git version control.
     * The greenfield gate exists because co-change signals require git history
     * to compute. When the project is not a git repo, there is no signal type
     * to evaluate — the gate's premise is absent, so it passes trivially
     * rather than fail-closed. Callers (typically `epic_run_phase`) resolve
     * this via `isGitRepo(directory)` from `src/git/branch.ts`.
     *
     * Backward-compat: omitted or `undefined` reverts to legacy behavior
     * (apply the `commitsObserved >= minCommitsForSignal` floor
     * unconditionally). Callers should pass an explicit boolean.
     */
    isGitProject?: boolean;
    /**
     * Phase 13 (B20): task IDs the architect declared in `depends:` that
     * don't resolve to ANY task in the plan. Typically an LLM typo. The
     * gate fails closed with a dedicated `phantom dep` blocking reason so
     * the architect sees the actual bad ID instead of being misled into
     * hunting a non-existent cross-phase upstream. Pass alongside
     * `crossPhaseUpstreams` (the two lists are disjoint).
     */
    phantomDeps?: readonly string[];
    /**
     * Phase 10 — predecessor-evidence gate redesign.
     *
     * Cross-phase upstream task IDs for the phase being decided: every
     * task that lives in a strictly-prior phase AND is depended on by a
     * task in the current phase. The gate verifies each one has a
     * `swarm(task <id>):` marker in git log via `isUpstreamCommitted`.
     *
     * Empty array (the legacy default) ⇒ no cross-phase deps to check;
     * predecessor evidence is vacuously satisfied. This is correct for
     * Phase 1 (no prior phase), single-phase projects, and phases the
     * architect explicitly declared as independent.
     *
     * Why this replaces the `commitsObserved >= minCommitsForSignal`
     * floor: the floor was a statistical proxy for "do we have enough
     * history to trust `p`?", but in small projects it permanently
     * blocked parallelism (a 12-task project never reaches 20 commits).
     * The structural check asks the actually-relevant question — "are
     * the things this phase depends on actually in git?" — directly,
     * regardless of project size. The architect's declared dep graph IS
     * the parallelism specification (Lamport happens-before); Rule 2's
     * commits ARE the synchronization point; this check ties them
     * together.
     *
     * Callers (`epic_run_phase`) compute this from the plan's dep graph.
     */
    crossPhaseUpstreams?: readonly string[];
    /**
     * Predicate for the predecessor-evidence check above. Returns true
     * when the given taskId has a `swarm(task <id>):` marker in git
     * history. Same predicate Rule 3 uses at the lane planner — share
     * one source of truth.
     *
     * Omitted ⇒ the gate treats every cross-phase upstream as
     * uncommitted (fail-closed). Pair `crossPhaseUpstreams` with this
     * predicate, or pass neither.
     */
    isUpstreamCommitted?: (taskId: string) => boolean;
}
/** Each gate's pass/fail outcome plus the evidence behind it. */
export interface EpicActivationRationale {
    pCheck: {
        passed: boolean;
        p: number;
        threshold: number;
    };
    hotModuleCheck: {
        passed: boolean;
        touchedHotModules: string[];
    };
    greenfieldCheck: {
        passed: boolean;
        commitsObserved: number;
        minCommits: number;
        /**
         * `true` when the caller flagged the project as non-git
         * (`options.isGitProject === false`). In that case the gate is
         * bypassed (`passed: true`) because the co-change signal does not
         * apply — not because the history floor was met. Surfaced for audit
         * so reviewers can distinguish "bypassed" from "satisfied".
         */
        bypassedNoGit?: boolean;
        /**
         * Phase 10: cross-phase upstream task IDs the gate consulted.
         * Empty when the current phase has no cross-phase deps (Phase 1,
         * single-phase plans, declared-independent phases).
         *
         * Phase 13 (B19): optional because pre-Phase-10 records on disk
         * (`.swarm/evidence/epic-promotions.jsonl`) lack this field.
         * Renderers MUST default to `[]` when reading historical records.
         */
        crossPhaseUpstreams?: string[];
        /**
         * Phase 10: cross-phase upstreams the predicate reported as NOT
         * yet committed. Non-empty ⇒ the gate failed; the architect
         * needs to wait for those tasks to commit before re-deciding.
         *
         * Phase 13 (B19): optional, same reason as above.
         */
        missingUpstreams?: string[];
        /**
         * Phase 13 (B20): dep IDs the architect declared that don't
         * resolve to any task in the plan. Usually an LLM typo; the gate
         * fails CLOSED so the architect can see the bad ID and fix the
         * declaration. Distinct from `missingUpstreams` because phantom
         * IDs aren't tasks that need to be "committed" — they don't
         * exist at all, and the remediation is "fix the dep ID", not
         * "wait for the upstream to land".
         */
        phantomDeps?: string[];
    };
}
/** The verdict `decideEpicActivation` returns. */
export interface EpicActivationVerdict {
    decision: 'promote' | 'demote';
    p: number;
    rationale: EpicActivationRationale;
    /** Plain-English reasons the verdict went the way it did — for logs and UI. */
    blockingReasons: string[];
}
/**
 * Decide whether the given tasks should be promoted to parallel execution
 * via Lean Turbo's lane planner.
 *
 * Inputs are pre-resolved by the caller:
 *  - `tasks`: every task in scope (typically the whole plan), with the
 *    same `{ id, scope }` shape Capability B consumes. The caller
 *    handles `readTaskScopes` / `files_touched` resolution and any
 *    completed-task filtering.
 *  - `cochangePairs`: the analyzer's output (unfiltered) plus the
 *    `commitsObserved` count from `parseGitLog`. The greenfield gate
 *    consults the count directly so the function stays pure.
 *  - `options`: thresholds (typically read from
 *    `turbo.epic.mode.*` + `turbo.epic.cochange.*`).
 *
 * Output: structured verdict the caller persists to
 * `.swarm/evidence/epic-promotions.jsonl` and surfaces via
 * `/swarm epic status`.
 */
export declare function decideEpicActivation(tasks: CouplingTask[], cochangePairs: CoChangeEntry[], commitsObserved: number, options: EpicActivationOptions): EpicActivationVerdict;

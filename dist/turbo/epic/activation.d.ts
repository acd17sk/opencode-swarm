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

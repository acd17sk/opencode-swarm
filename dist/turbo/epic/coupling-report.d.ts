/**
 * Coupling report computation for Epic mode (Capability B).
 *
 * Given a plan, computes:
 *  - `p` — the coupling coefficient (fraction of task pairs that conflict
 *          under the combined path + co-change signal from Capability A).
 *  - `perModule` — for each file/module that caused at least one conflict,
 *          the count of conflicting pairs it appeared in.
 *  - `roadmap` — the modules ranked by conflict-contribution, with each
 *          one's share of total detected conflicts. The team can use this
 *          as a decoupling priority order.
 *
 * Read-only — this module changes no execution behavior. It composes
 * Capability A's `epicPairConflict` (the same predicate the future epic
 * mode will use when scheduling), so the report answers exactly the
 * question "what would Capability A say about this plan if I asked it
 * about every task pair?".
 */
import type { CoChangeEntry } from '../../tools/co-change-analyzer.js';
import { type CoChangeThreshold, type EpicPairVerdict } from './cochange-conflict.js';
/** A task as `epic` mode sees it: identifier + declared file scope. */
export interface CouplingTask {
    id: string;
    scope: string[];
}
/** One conflicting pair in the report. */
export interface ConflictingPair {
    a: string;
    b: string;
    reason: EpicPairVerdict['reason'];
    cochangeMatches: number;
    pathMatches: number;
}
/** Per-module conflict contribution. */
export interface ModuleContention {
    module: string;
    conflicts: number;
    share: number;
}
/** Output of `computeCouplingReport`. */
export interface CouplingReport {
    /** Number of tasks considered. */
    taskCount: number;
    /** Number of unordered task pairs evaluated (`n*(n-1)/2`). */
    totalPairs: number;
    /** Pairs the combined signal flagged as conflicting. */
    conflictingPairCount: number;
    /** Coupling coefficient `p` = conflictingPairCount / totalPairs (0 when totalPairs == 0). */
    p: number;
    /** Each conflicting pair, with the per-pair verdict reason and evidence counts. */
    conflictingPairs: ConflictingPair[];
    /** Per-module contention table, sorted by `conflicts` descending. */
    perModule: ModuleContention[];
    /** Top-N modules with a human-readable rank line for each. */
    roadmap: string[];
}
export interface ComputeCouplingReportOptions {
    /** Cap on roadmap rank entries. Default 5. */
    roadmapTop?: number;
}
/**
 * Compute the coupling report over a set of tasks.
 *
 * Inputs:
 *  - `tasks`: the tasks to consider. The caller decides scoping (whole
 *    plan vs a single phase) and any filtering (pending vs all). Empty
 *    array is valid and produces `p = 0`.
 *  - `cochangePairs`: typically the output of
 *    `getCoChangePairs(directory)` — passed in so this function stays
 *    pure (no I/O) and trivially testable. Empty array is valid (the
 *    Capability A predicate falls back to path-only verdicts).
 *  - `threshold`: NPMI + min-co-changes floor, same shape Capability A
 *    consumes.
 *  - `options.roadmapTop`: how many modules to list in the roadmap
 *    (default 5).
 *
 * Pure function — no file I/O, no side effects.
 */
export declare function computeCouplingReport(tasks: CouplingTask[], cochangePairs: CoChangeEntry[], threshold: CoChangeThreshold, options?: ComputeCouplingReportOptions): CouplingReport;
/**
 * Render a `CouplingReport` as a markdown document. Output shape is
 * stable so downstream tools can parse it; the JSON form (via
 * `JSON.stringify(report)`) is the better target for programmatic use.
 */
export declare function formatCouplingReportMarkdown(report: CouplingReport): string;

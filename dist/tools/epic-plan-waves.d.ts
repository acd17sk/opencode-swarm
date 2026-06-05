/**
 * Epic Mode `epic_plan_waves` tool.
 *
 * Wraps `planEpicWaves` from `src/turbo/epic/wave-planner`. Partitions a
 * phase's pending tasks into ordered concurrent waves and returns them in a
 * shape the architect can iterate over for wave-by-wave Task dispatch.
 *
 * This is Epic Mode's replacement for `lean_turbo_plan_lanes`. The lane
 * planner stays in place for non-Epic Lean Turbo callers; Epic flows route
 * through this tool because the wave abstraction expresses branching DAGs
 * (sibling fanout from a shared prefix) correctly, where lanes collapse them.
 */
import type { ToolDefinition } from '@opencode-ai/plugin/tool';
import { loadPluginConfigWithMeta as loadPluginConfigWithMeta_import } from '../config';
import { buildIsUpstreamCommittedWithStatus as buildIsUpstreamCommittedWithStatus_import } from '../turbo/epic/upstream-commits';
import { type EpicWavePlan } from '../turbo/epic/wave-planner';
import { readTaskScopes as readTaskScopes_import } from '../turbo/lean/conflicts';
import type { PlanPhase } from '../turbo/lean/partition-common';
/** Arguments for the `epic_plan_waves` tool. */
export interface EpicPlanWavesArgs {
    directory: string;
    phase: number;
    scopes?: Record<string, string[]>;
}
/** Result envelope. */
export interface EpicPlanWavesResult {
    success: boolean;
    /** Set on success — the full wave plan from `planEpicWaves`. */
    plan?: EpicWavePlan;
    /** Set on success — shortcut alias for `plan.waves`. */
    waves?: EpicWavePlan['waves'];
    /** Set on success — shortcut alias for `plan.serializedTasks`. */
    serializedTasks?: EpicWavePlan['serializedTasks'];
    /** Set on success — shortcut alias for `plan.degradedTasks`. */
    degradedTasks?: EpicWavePlan['degradedTasks'];
    /**
     * Set when `reason === 'scopes-missing'` — the task ids that have no
     * declared scope and no `files_touched` fallback. The architect must
     * call `declare_scope` for each of these and re-invoke this tool.
     */
    missingScopes?: string[];
    /** Set on failure — categorical short code (machine-readable). */
    reason?: 'no-plan' | 'no-phase' | 'phase-empty' | 'phase-already-complete' | 'scopes-missing' | 'git-failed' | 'planner-error';
    /** Set on failure — long-form actionable error text. */
    errors?: string[];
}
declare function readPlanJson(directory: string): {
    phases: PlanPhase[];
} | null;
/**
 * Execute the `epic_plan_waves` tool.
 *
 * Six possible outcomes:
 *   1. `no-plan` — `.swarm/plan.json` missing / unparseable
 *   2. `no-phase` — phase number not in `plan.json`
 *   3. `phase-empty` — phase exists but has zero tasks
 *   4. `phase-already-complete` — every task already completed
 *   5. `scopes-missing` — one or more pending tasks have no declared scope
 *      (preflight; identical to `epic_decide_phase` so the architect can't
 *      bypass scope discipline by calling planner direct)
 *   6. `git-failed` — git log scan failed (Rule 3 evidence unavailable;
 *      we fail closed rather than implicitly satisfying cross-batch deps)
 *   7. success — `plan` and aliased fields populated
 */
export declare function executeEpicPlanWaves(args: EpicPlanWavesArgs): Promise<EpicPlanWavesResult>;
/**
 * DI seam — same pattern as `lean-turbo-plan-lanes.ts` (AGENTS.md invariant 7).
 * Tests substitute deterministic doubles via `_internals.*` rather than `mock.module`.
 */
export declare const _internals: {
    readPlanJson: typeof readPlanJson;
    readTaskScopes: typeof readTaskScopes_import;
    isGitRepo: (cwd: string) => boolean;
    buildIsUpstreamCommittedWithStatus: typeof buildIsUpstreamCommittedWithStatus_import;
    loadPluginConfigWithMeta: typeof loadPluginConfigWithMeta_import;
};
/**
 * Format the MANDATORY user-facing surface block for `epic_plan_waves`.
 *
 * Same enforcement strategy as `formatVerdictSurfaceBlock` in
 * `epic-run-phase.ts`: the EPIC_MODE_BANNER's step-4b "MANDATORY SURFACE"
 * wording reached the architect (Kimi K2.6, fair-clinical-bench Phase 3,
 * 2026-06-05) but was silently ignored — the model dispatched a single
 * `Task` call with no wave plan emitted to the user. Banner-level
 * instruction is insufficient.
 *
 * Tool-side fix: prepend the literal surface text the architect must
 * echo, pre-formatted, with an imperative "STOP. copy verbatim NOW.
 * Do not dispatch any Task yet." prelude. Returns '' on failures the
 * banner doesn't mandate a surface for (`scopes-missing`,
 * `phase-already-complete`, `no-phase`, etc.).
 */
export declare function formatWavePlanSurfaceBlock(result: EpicPlanWavesResult, phase: number): string;
/** Tool definition for `epic_plan_waves`. */
export declare const epic_plan_waves: ToolDefinition;
export {};

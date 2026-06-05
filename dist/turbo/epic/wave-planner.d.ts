/**
 * Epic Mode Wave Planner.
 *
 * The wave planner partitions a phase's pending tasks into ordered *waves*.
 * A wave is a set of tasks that:
 *   - have all their dependencies satisfied by tasks in completed waves, AND
 *   - have mutually disjoint declared scopes (no two tasks in the same wave
 *     touch a shared file or parent/child path).
 *
 * Architectural contrast with the lane planner:
 *   - Lane planner: greedy fill into a fixed number of independent serial
 *     chains. Branching DAGs (e.g. `A → B → {C, D, E}`) collapse into a
 *     single chain because the cross-lane-dep rule forbids C/D/E from
 *     living in a different lane than A/B.
 *   - Wave planner: emits a sequence of concurrent groups. The same DAG
 *     becomes `wave 1: [A], wave 2: [B], wave 3: [C, D, E]`. Within a wave
 *     the architect dispatches one Task per taskId — all in one message —
 *     and the next wave starts only when the prior one is done.
 *
 * The two planners share `runPartitionPreflight` from `partition-common.ts`
 * so classification (global/protected/no-scope/normal), scope resolution,
 * and topological sort are identical. Divergence is intentional and lives
 * only in the assignment loop below.
 */
import type { LeanTurboConfig } from '../../config/schema';
import { type PlanPhase } from '../lean/partition-common';
import type { LeanTurboDegradedTask } from '../lean/state';
/**
 * A single wave in the Epic plan. Tasks in a wave run concurrently; the next
 * wave starts only after all tasks in this wave complete.
 */
export interface EpicWave {
    /** 1-indexed wave number (display + ordering). */
    waveId: number;
    /** Tasks in this wave. Architect dispatches one Task per id, all in one message. */
    taskIds: string[];
    /**
     * Union of declared scope files across the wave. Informational — Epic
     * Mode does NOT acquire file locks (architect-driven dispatch goes
     * directly through `Task`, bypassing the lean runner's lock path).
     * Used for evidence/divergence reporting.
     */
    files: string[];
}
/**
 * The complete wave plan produced by `planEpicWaves`.
 */
export interface EpicWavePlan {
    /** The phase number this plan covers. */
    phase: number;
    /** Unique identifier for this wave plan. */
    planId: string;
    /** Ordered list of waves. Empty when every task degraded or serialized. */
    waves: EpicWave[];
    /** Tasks that were serialized (cycles, no-scope, invalid-scope, protected with serialize policy). */
    serializedTasks: string[];
    /** Tasks that were degraded (global files, protected paths, Rule-3 leftovers). */
    degradedTasks: LeanTurboDegradedTask[];
    /** Human-readable summary when all tasks ended up degraded. */
    degradationSummary?: string;
    /** Total number of pending tasks the planner saw (before assignment). */
    totalPendingTasks: number;
    /** Sum of `waves[*].taskIds.length` — tasks that will actually run concurrently in a wave. */
    totalConcurrentTasks: number;
}
/**
 * Partition phase tasks into ordered concurrent waves.
 *
 * @param directory - Project root directory
 * @param phaseNumber - Phase number to plan
 * @param plan - The full plan object (from `.swarm/plan.json`)
 * @param config - Lean Turbo configuration (reused for risk/conflict policy)
 * @param scopes - Optional pre-loaded scopes map (taskId -> file paths)
 * @param isUpstreamCommitted - Optional Rule-3 predicate (greenfield-smart).
 *        When supplied, a cross-batch dependency (a `depends:` upstream NOT
 *        in this planning call's task set) is treated as satisfied only if
 *        the predicate returns `true`. Without it, legacy semantics apply
 *        (cross-batch deps implicitly satisfied).
 * @returns Complete wave plan with ordered concurrent groups.
 */
export declare function planEpicWaves(directory: string, phaseNumber: number, plan: {
    phases: PlanPhase[];
}, config: LeanTurboConfig, scopes?: Record<string, string[]>, isUpstreamCommitted?: (taskId: string) => boolean): EpicWavePlan;

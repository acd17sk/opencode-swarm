/**
 * Shared partition primitives for Lean Turbo's lane planner AND Epic Mode's
 * wave planner. Both planners run the same three preflight steps:
 *
 *   1. Resolve declared scopes (or files_touched fallback) per pending task.
 *   2. Classify each task by file risk (global / protected / no-scope / normal).
 *   3. Topologically sort with cycle detection so a downstream task can never
 *      be released before its upstream.
 *
 * They diverge only at the assignment step:
 *   - Lane planner: greedy fill into a fixed number of serial chains.
 *   - Wave planner: emit ordered concurrent groups whose membership is gated
 *     by inter-task scope disjointness.
 *
 * Owning the preflight in one place guarantees both planners produce
 * identical classifications and sort orders for the same inputs.
 */
import type { LeanTurboConfig } from '../../config/schema';
import { type TaskRiskAssessment } from './risk';
/**
 * A single task within a plan phase. Matches `.swarm/plan.json`.
 */
export interface PlanTask {
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';
    depends?: string[];
    files_touched?: string[];
}
/**
 * A phase within a plan, containing multiple tasks.
 */
export interface PlanPhase {
    id: number;
    name: string;
    tasks: PlanTask[];
}
export type ClassifiedTask = {
    task: PlanTask;
    files: string[];
    hasDeclaredScope: boolean;
    category: TaskRiskAssessment['category'];
    conflictReason?: string;
};
export interface PartitionPreflight {
    /** Topologically sorted, lexicographically tie-broken. */
    sortedTasks: ClassifiedTask[];
    /** taskId -> ClassifiedTask for O(1) lookup. */
    taskMap: Map<string, ClassifiedTask>;
    /** Tasks whose deps form a cycle. Callers must fail-closed: serialize them. */
    tasksInCycle: Set<string>;
}
/**
 * Validate and normalize a task's declared scope.
 *
 * Symlink containment is NOT enforced here — the lock layer resolves symlinks
 * at acquisition time. This lets architects declare scopes with symlinks for
 * convenience without compromising actual file-write safety.
 *
 * @returns Tuple of [validFiles, invalidCount]
 */
export declare function getValidatedFiles(files: string[], directory: string): [string[], number];
/**
 * Run the shared preflight: resolve scopes, classify by risk, topo-sort with
 * cycle detection.
 *
 * The same `(directory, pendingTasks, config, scopes)` produces the same
 * `PartitionPreflight` from both planners.
 */
export declare function runPartitionPreflight(directory: string, pendingTasks: PlanTask[], config: LeanTurboConfig, scopes?: Record<string, string[]>): PartitionPreflight;
/**
 * Build the predicate that a task's dependencies are all satisfied.
 *
 * Rule 3 (greenfield-smart): when `isUpstreamCommitted` is supplied, a
 * cross-batch dependency (a `depends:` upstream NOT in the current planning
 * call's task set — typically completed in a prior phase) is treated as
 * satisfied **only** if the predicate returns `true`. Without the predicate
 * the legacy semantics apply: cross-batch deps are implicitly satisfied.
 */
export declare function makeDependencySatisfactionChecker(taskMap: Map<string, ClassifiedTask>, assignedTasks: Set<string>, isUpstreamCommitted?: (taskId: string) => boolean): (task: ClassifiedTask) => boolean;
/**
 * Return the next group of tasks ready for assignment: not yet assigned and
 * all dependencies satisfied. Lexicographically sorted for determinism.
 */
export declare function getReadyTasks(sortedTasks: ClassifiedTask[], assignedTasks: Set<string>, isSatisfied: (task: ClassifiedTask) => boolean): ClassifiedTask[];

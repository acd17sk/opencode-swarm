/**
 * Epic Mode divergence-record tool (Capability D — capture leg).
 *
 * After the architect marks a task `completed` via `update_task_status`, it
 * calls this tool with `{ directory, taskId, sessionID }`. The tool:
 *
 *   1. Reads the task's DECLARED scope from `.swarm/scopes/scope-{taskId}.json`
 *      (the same on-disk record `readScopeFromDisk` consults).
 *   2. Reads the ACTUAL files the coder modified from the session's
 *      `modifiedFilesThisCoderTask` — populated by the guardrails write hook
 *      and reset by Lean Turbo at task-boundaries, so it captures THIS
 *      task's writes only.
 *   3. Appends one record to `.swarm/epic/divergence.jsonl` via
 *      `recordTaskDivergence`. The calibration engine reads that file on the
 *      next `epic_decide_phase` invocation (the architect-facing decide
 *      tool — `epic_run_phase` is the legacy unified path, retained as
 *      `executeEpicRunPhase` for composition users only).
 *
 * Best-effort by design — failure to record divergence is logged but never
 * surfaces as a task-blocking error. Worst case: a single observation is
 * missed and the calibration loop sees one fewer data point.
 *
 * Composition contract: this tool does NOT modify `update_task_status` or
 * any maintainer file. The architect is instructed to call it via the
 * `EPIC_MODE_BANNER` system-enhancer injection. If the architect forgets,
 * the only effect is missing calibration signal — Epic Mode keeps working.
 */
import type { ToolDefinition } from '@opencode-ai/plugin/tool';
import { loadPlanJsonOnly as loadPlanJsonOnly_import } from '../plan/manager.js';
import { readScopeFromDisk as readScopeFromDisk_import } from '../scope/scope-persistence.js';
import { getAgentSession as getAgentSession_import, hasActiveEpicMode as hasActiveEpicMode_import } from '../state.js';
import { recordTaskDivergence as recordTaskDivergence_import } from '../turbo/epic/divergence-recorder.js';
export interface EpicRecordDivergenceArgs {
    directory: string;
    taskId: string;
    sessionID: string;
}
export interface EpicRecordDivergenceResult {
    success: boolean;
    /**
     * Either:
     *  - `'recorded'` — a record was appended to divergence.jsonl.
     *  - `'epic-mode-not-active'` — session has not toggled Epic Mode; no-op.
     *  - `'no-scope'` — no declared scope on disk for this task (could be a
     *    pure verification task that bypassed `declare_scope`). Skipped.
     *  - `'no-session'` — no agent session for `sessionID`; skipped.
     *  - `'persist-failed'` — write to JSONL failed (logged); skipped.
     */
    reason: string;
    /** When `reason === 'recorded'`, summarises the record without the full file lists. */
    summary?: {
        declaredCount: number;
        actualCount: number;
        undeclaredCount: number;
        unusedCount: number;
        divergenceRatio: number;
        isClean: boolean;
    };
}
/**
 * Test-only DI seam (AGENTS.md invariant 7). Mutating this object is
 * file-scoped and trivially restorable via afterEach, avoiding Bun's
 * cross-file `mock.module` leak.
 */
export declare const _internals: {
    hasActiveEpicMode: typeof hasActiveEpicMode_import;
    getAgentSession: typeof getAgentSession_import;
    readScopeFromDisk: typeof readScopeFromDisk_import;
    loadPlanJsonOnly: typeof loadPlanJsonOnly_import;
    recordTaskDivergence: typeof recordTaskDivergence_import;
};
export declare function executeEpicRecordDivergence(args: EpicRecordDivergenceArgs): Promise<EpicRecordDivergenceResult>;
export declare const epic_record_divergence: ToolDefinition;

/**
 * Epic Mode run-phase tool (Capability C).
 *
 * The architect invokes this tool — instead of `lean_turbo_run_phase` —
 * when Epic Mode is active. It:
 *
 *   1. Verifies Epic Mode is on for the session (else fails closed).
 *   2. Loads the plan, resolves task scopes the same way the coupling
 *      report does, and queries the co-change signal.
 *   3. Runs `decideEpicActivation` over the WHOLE PLAN (per-plan
 *      activation per Q1) to get a `promote | demote` verdict.
 *   4. Appends one record to `.swarm/evidence/epic-promotions.jsonl`
 *      and updates `.swarm/epic-state.json` with the verdict.
 *   5. If promoted: invokes `LeanTurboRunner` for the given phase by
 *      composition (zero edits to `src/turbo/lean/`).
 *   6. If demoted: returns a structured "epic recommends serial"
 *      verdict so the caller can fall back to the standard serial
 *      flow.
 *
 * Composition contract: this tool is the only architect-facing entry
 * point Capability C adds. It does not modify `lean_turbo_run_phase`,
 * `LeanTurboRunner`, or any Lean Turbo file. Decision happens above
 * Lean Turbo; execution dispatches into Lean Turbo via import only.
 */
import type { ToolDefinition } from '@opencode-ai/plugin/tool';
import { loadPluginConfigWithMeta as loadPluginConfigWithMeta_import } from '../config/index.js';
import { loadPlanJsonOnly as loadPlanJsonOnly_import } from '../plan/manager.js';
import type { EpicActivationVerdict } from '../turbo/epic/activation.js';
import { decideEpicActivation as decideEpicActivation_import } from '../turbo/epic/activation.js';
import { loadCalibrationState as loadCalibrationState_import, saveCalibrationState as saveCalibrationState_import } from '../turbo/epic/calibration.js';
import { applyCalibration as applyCalibration_import, effectiveActivationThreshold as effectiveActivationThreshold_import, effectiveHotModules as effectiveHotModules_import } from '../turbo/epic/calibration-engine.js';
import { getCoChangeData as getCoChangeData_import } from '../turbo/epic/cochange-source.js';
import { readDivergenceHistory as readDivergenceHistory_import } from '../turbo/epic/divergence-recorder.js';
import { appendPromotionEvidence as appendPromotionEvidence_import } from '../turbo/epic/promotion-evidence.js';
import { isEpicModeActive as isEpicModeActive_import, recordEpicDecision as recordEpicDecision_import } from '../turbo/epic/state.js';
import { readTaskScopes as readTaskScopes_import } from '../turbo/lean/conflicts.js';
import type { LaneResult } from '../turbo/lean/runner.js';
import { LeanTurboRunner as LeanTurboRunner_import } from '../turbo/lean/runner.js';
export interface EpicRunPhaseArgs {
    directory: string;
    phase: number;
    sessionID: string;
}
export interface EpicRunPhaseResult {
    success: boolean;
    /** The verdict for this run, persisted to evidence. */
    verdict?: EpicActivationVerdict;
    /** Set when the verdict was `promote` and Lean Turbo ran. */
    lanes?: LaneResult[];
    degradedTasks?: string[];
    serializedTasks?: string[];
    /**
     * Either:
     *  - `'demoted'` — epic chose serial; the caller should fall back.
     *  - `'promoted'` — epic chose parallel and Lean Turbo ran.
     *  - `'epic-mode-not-active'` — the session has not toggled Epic Mode.
     *  - `'no-plan'` — `.swarm/plan.json` is missing.
     *  - `'lean-runner-error'` — Lean Turbo threw during promoted execution.
     *  - `'scopes-missing'` — one or more pending tasks in the phase have
     *    neither a declared scope file on disk nor `files_touched` in
     *    plan.json. Lean Turbo's lane planner needs scope data to compute
     *    parallel lanes; without it the dispatch returns empty lanes and
     *    the parallelization promise is silently broken. The architect
     *    must call `declare_scope` for each missing task and then
     *    re-invoke `epic_run_phase`.
     */
    reason: string;
    /** Set when `reason === 'lean-runner-error'`. */
    errors?: string[];
    /** Set when `reason === 'scopes-missing'` — the task ids with no scope. */
    missingScopes?: string[];
    /** Set when `reason === 'scopes-missing'` — actionable message for the architect. */
    message?: string;
}
/**
 * Test-only DI seam. Mutating this object is file-scoped and trivially
 * restorable via afterEach, avoiding Bun's cross-file `mock.module`
 * leak (AGENTS.md invariant 7).
 */
export declare const _internals: {
    loadPluginConfigWithMeta: typeof loadPluginConfigWithMeta_import;
    loadPlanJsonOnly: typeof loadPlanJsonOnly_import;
    getCoChangeData: typeof getCoChangeData_import;
    decideEpicActivation: typeof decideEpicActivation_import;
    appendPromotionEvidence: typeof appendPromotionEvidence_import;
    recordEpicDecision: typeof recordEpicDecision_import;
    isEpicModeActive: typeof isEpicModeActive_import;
    readTaskScopes: typeof readTaskScopes_import;
    loadCalibrationState: typeof loadCalibrationState_import;
    saveCalibrationState: typeof saveCalibrationState_import;
    applyCalibration: typeof applyCalibration_import;
    effectiveActivationThreshold: typeof effectiveActivationThreshold_import;
    effectiveHotModules: typeof effectiveHotModules_import;
    readDivergenceHistory: typeof readDivergenceHistory_import;
    LeanTurboRunner: typeof LeanTurboRunner_import;
};
/**
 * Decide-only path: runs stages 1-9 of the phase flow (preflight + calibration
 * + co-change + decision + evidence write + session state mirror) and returns
 * the verdict WITHOUT dispatching Lean Turbo.
 *
 * This is the shared helper between:
 *  - `epic_run_phase`: legacy unified tool (decide + dispatch in one call) —
 *    calls this then continues with dispatch when verdict is promote.
 *  - `epic_decide_phase`: transparent path (decide only — architect then
 *    dispatches lanes via Task for visibility).
 *
 * Returns the same EpicRunPhaseResult shape with:
 *  - reason: 'decided'  → verdict is promote, caller may dispatch.
 *  - reason: 'demoted'  → verdict is demote, caller falls back to serial.
 *  - reason: 'epic-mode-not-active' / 'no-plan' / 'scopes-missing' /
 *    'epic-state-unreadable' → error, see fields.
 */
export declare function executeEpicDecidePhase(args: EpicRunPhaseArgs): Promise<EpicRunPhaseResult>;
/**
 * Full unified path: decide + dispatch in one call (legacy behavior).
 *
 * For transparent CLI-visible dispatch, prefer `epic_decide_phase` + lane
 * dispatch via the architect's Task tool — see EPIC_MODE_BANNER. This unified
 * path remains for back-compat and for callers that don't need visibility
 * into the parallel coder agents.
 */
export declare function executeEpicRunPhase(args: EpicRunPhaseArgs): Promise<EpicRunPhaseResult>;
/**
 * NOTE: `epic_run_phase` is intentionally NOT exposed as a tool to the
 * architect. The transparent decide-then-dispatch path (epic_decide_phase
 * + lean_turbo_plan_lanes + Task dispatch) is the ONLY supported flow,
 * because it gives the user real-time visibility into the parallel coder
 * agents. The legacy unified-path function `executeEpicRunPhase` remains
 * exported for tests and any composition users, but no ToolDefinition
 * wraps it — so the architect cannot call it and accidentally fall back
 * to the opaque path. This is a deliberate product decision: one path,
 * unambiguous, always-visible.
 */
/**
 * Transparent decide-only tool. Returns the verdict (promote/demote/error)
 * without dispatching Lean Turbo. The architect should:
 *  1. Call this after declaring scopes for all pending tasks.
 *  2. Surface the verdict to the user.
 *  3. If verdict is `promote`, call `lean_turbo_plan_lanes` to get the lane
 *     plan, then dispatch each lane via the `Task` tool (one Task call per
 *     lane, all in one message for parallel execution). Each Task is a
 *     visible subagent the user can click into for live progress.
 *  4. After each task completes (via `update_task_status`), call
 *     `epic_record_divergence` to feed the calibration loop.
 *
 * This is the CLI-visibility path. The legacy `epic_run_phase` bundles
 * decide + dispatch into one opaque tool call where the user can't see
 * the parallel coder agents Lean Turbo spawns.
 */
export declare const epic_decide_phase: ToolDefinition;

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
import { getCoChangeData as getCoChangeData_import } from '../turbo/epic/cochange-source.js';
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
     */
    reason: string;
    /** Set when `reason === 'lean-runner-error'`. */
    errors?: string[];
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
    LeanTurboRunner: typeof LeanTurboRunner_import;
};
export declare function executeEpicRunPhase(args: EpicRunPhaseArgs): Promise<EpicRunPhaseResult>;
export declare const epic_run_phase: ToolDefinition;

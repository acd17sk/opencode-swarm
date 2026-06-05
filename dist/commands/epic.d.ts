/**
 * `/swarm epic` — Epic Mode activation toggle and diagnostics (Capability C).
 *
 * Subcommands:
 *   /swarm epic on        — enable Epic Mode for this session
 *   /swarm epic off       — disable Epic Mode for this session
 *   /swarm epic           — toggle (on if off, off if on)
 *   /swarm epic status    — show current state + last decision rationale
 *   /swarm epic decide    — run the activation decision once and print the
 *                            verdict without dispatching execution
 *                            (read-only what-if; does NOT write to
 *                             `.swarm/evidence/epic-promotions.jsonl`)
 *
 * Toggling only mutates session state (and the durable
 * `.swarm/epic-state.json`); it does not start or stop any execution. The
 * `epic_decide_phase` + `epic_plan_waves` tools (plus per-wave Task dispatch
 * by the architect) are the architect-facing entries that gate execution.
 */
import { loadPluginConfigWithMeta } from '../config/index.js';
import { isGitRepo } from '../git/branch.js';
import { loadPlanJsonOnly } from '../plan/manager.js';
import { ensureAgentSession } from '../state.js';
import { decideEpicActivation } from '../turbo/epic/activation.js';
import { isCalibrationStateUnreadable, loadCalibrationState } from '../turbo/epic/calibration.js';
import { getCoChangeData } from '../turbo/epic/cochange-source.js';
import { readDivergenceHistory } from '../turbo/epic/divergence-recorder.js';
import { readPromotionEvidence } from '../turbo/epic/promotion-evidence.js';
import { disableEpicMode, enableEpicMode, isEpicModeActive, isStateUnreadable, loadEpicSessionState } from '../turbo/epic/state.js';
import { readTaskScopes } from '../turbo/lean/conflicts.js';
/**
 * Test-only DI seam. Production code calls `_internals.fn(...)` so tests can
 * replace these without `mock.module` (AGENTS.md invariant 7).
 */
export declare const _internals: {
    loadPluginConfigWithMeta: typeof loadPluginConfigWithMeta;
    loadPlanJsonOnly: typeof loadPlanJsonOnly;
    getCoChangeData: typeof getCoChangeData;
    decideEpicActivation: typeof decideEpicActivation;
    ensureAgentSession: typeof ensureAgentSession;
    isEpicModeActive: typeof isEpicModeActive;
    isStateUnreadable: typeof isStateUnreadable;
    loadEpicSessionState: typeof loadEpicSessionState;
    enableEpicMode: typeof enableEpicMode;
    disableEpicMode: typeof disableEpicMode;
    readTaskScopes: typeof readTaskScopes;
    readPromotionEvidence: typeof readPromotionEvidence;
    loadCalibrationState: typeof loadCalibrationState;
    isCalibrationStateUnreadable: typeof isCalibrationStateUnreadable;
    readDivergenceHistory: typeof readDivergenceHistory;
    isGitRepo: typeof isGitRepo;
};
export declare function handleEpicCommand(directory: string, args: string[], sessionID: string): Promise<string>;

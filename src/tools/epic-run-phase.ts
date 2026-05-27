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
import { z } from 'zod';
import { loadPluginConfigWithMeta as loadPluginConfigWithMeta_import } from '../config/index.js';
import { loadPlanJsonOnly as loadPlanJsonOnly_import } from '../plan/manager.js';
import { swarmState } from '../state.js';
import type { EpicActivationVerdict } from '../turbo/epic/activation.js';
import { decideEpicActivation as decideEpicActivation_import } from '../turbo/epic/activation.js';
import {
	loadCalibrationState as loadCalibrationState_import,
	saveCalibrationState as saveCalibrationState_import,
} from '../turbo/epic/calibration.js';
import {
	applyCalibration as applyCalibration_import,
	effectiveActivationThreshold as effectiveActivationThreshold_import,
	effectiveHotModules as effectiveHotModules_import,
} from '../turbo/epic/calibration-engine.js';
import { getCoChangeData as getCoChangeData_import } from '../turbo/epic/cochange-source.js';
import type { CouplingTask } from '../turbo/epic/coupling-report.js';
import { readDivergenceHistory as readDivergenceHistory_import } from '../turbo/epic/divergence-recorder.js';
import { appendPromotionEvidence as appendPromotionEvidence_import } from '../turbo/epic/promotion-evidence.js';
import {
	isEpicModeActive as isEpicModeActive_import,
	recordEpicDecision as recordEpicDecision_import,
} from '../turbo/epic/state.js';
import { readTaskScopes as readTaskScopes_import } from '../turbo/lean/conflicts.js';
import type { LaneResult } from '../turbo/lean/runner.js';
import { LeanTurboRunner as LeanTurboRunner_import } from '../turbo/lean/runner.js';
import * as logger from '../utils/logger.js';
import { createSwarmTool } from './create-tool.js';

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
export const _internals = {
	loadPluginConfigWithMeta: loadPluginConfigWithMeta_import,
	loadPlanJsonOnly: loadPlanJsonOnly_import,
	getCoChangeData: getCoChangeData_import,
	decideEpicActivation: decideEpicActivation_import,
	appendPromotionEvidence: appendPromotionEvidence_import,
	recordEpicDecision: recordEpicDecision_import,
	isEpicModeActive: isEpicModeActive_import,
	readTaskScopes: readTaskScopes_import,
	loadCalibrationState: loadCalibrationState_import,
	saveCalibrationState: saveCalibrationState_import,
	applyCalibration: applyCalibration_import,
	effectiveActivationThreshold: effectiveActivationThreshold_import,
	effectiveHotModules: effectiveHotModules_import,
	readDivergenceHistory: readDivergenceHistory_import,
	LeanTurboRunner: LeanTurboRunner_import as typeof LeanTurboRunner_import,
};

export async function executeEpicRunPhase(
	args: EpicRunPhaseArgs,
): Promise<EpicRunPhaseResult> {
	const { directory, phase, sessionID } = args;

	if (!_internals.isEpicModeActive(directory, sessionID)) {
		return {
			success: false,
			reason: 'epic-mode-not-active',
		};
	}

	const plan = await _internals.loadPlanJsonOnly(directory);
	if (plan === null) {
		return { success: false, reason: 'no-plan' };
	}

	// Load epic + cochange config (with safe defaults if the keys are
	// absent — caller may have only enabled the mode via /swarm epic on).
	const { config } = _internals.loadPluginConfigWithMeta(directory);
	const modeCfg = config.turbo?.epic?.mode;
	const cochangeCfg = config.turbo?.epic?.cochange;
	const calibrationCfg = config.turbo?.epic?.calibration;
	const staticActivationThreshold = modeCfg?.activation_threshold ?? 0.3;
	const minCommitsForSignal = modeCfg?.min_commits_for_signal ?? 20;
	const cochangeNpmiThreshold = cochangeCfg?.threshold ?? 0.6;
	const cochangeMinCoChanges = cochangeCfg?.min_co_changes ?? 5;
	const calibrationEnabled = calibrationCfg?.enabled !== false;

	// --- Capability D: roll calibration forward from any divergence records
	// observed since the last `epic_run_phase` call. The engine is pure; the
	// only side effect is the calibration-state write at the end. Failure is
	// non-fatal — calibration is opportunistic, not load-bearing for safety.
	let effectiveThreshold = staticActivationThreshold;
	let extraHotModules: string[] = [];
	if (calibrationEnabled) {
		try {
			const currentCalibration = _internals.loadCalibrationState(directory);
			if (currentCalibration !== null) {
				// Full read: the calibration engine slices by record COUNT
				// (`processedRecords`), so a tail-truncated view would
				// silently miss records once the file exceeds the default
				// 16 MiB cap. Trade memory pressure for correctness here;
				// rotation/byte-offset tracking is a future enhancement.
				const history = _internals.readDivergenceHistory(directory, {
					maxBytes: Number.POSITIVE_INFINITY,
				});
				const newRecords = history.slice(currentCalibration.processedRecords);
				if (newRecords.length > 0) {
					const updated = _internals.applyCalibration(
						currentCalibration,
						newRecords,
						{
							staticThreshold: staticActivationThreshold,
							floorThreshold: calibrationCfg?.floor_threshold,
							tightenStep: calibrationCfg?.tighten_step,
							loosenStep: calibrationCfg?.loosen_step,
							loosenWindow: calibrationCfg?.loosen_window,
						},
					);
					let savedSuccessfully = false;
					try {
						_internals.saveCalibrationState(directory, updated);
						savedSuccessfully = true;
					} catch (err) {
						// Critical: if persistence failed we MUST NOT use the
						// in-memory `updated` for this run either. The next
						// `epic_run_phase` would re-read the OLD `processedRecords`
						// from disk and re-apply the same divergence records,
						// causing silent threshold drift across repeated failures
						// (adversarial review H1). Sacrifice one run of new signal
						// to preserve correctness — fall back to the durable state.
						logger.warn(
							`[epic_run_phase] calibration persist failed; ignoring this run's calibration delta to avoid drift on next run: ${err instanceof Error ? err.message : String(err)}`,
						);
					}
					const sourceForThisRun = savedSuccessfully
						? updated
						: currentCalibration;
					effectiveThreshold = _internals.effectiveActivationThreshold(
						staticActivationThreshold,
						sourceForThisRun,
					);
					extraHotModules = _internals.effectiveHotModules(
						[],
						sourceForThisRun,
					);
				} else {
					effectiveThreshold = _internals.effectiveActivationThreshold(
						staticActivationThreshold,
						currentCalibration,
					);
					extraHotModules = _internals.effectiveHotModules(
						[],
						currentCalibration,
					);
				}
			}
		} catch (err) {
			logger.warn(
				`[epic_run_phase] calibration step failed, falling back to static knobs: ${err instanceof Error ? err.message : String(err)}`,
			);
			effectiveThreshold = staticActivationThreshold;
			extraHotModules = [];
		}
	}

	// Q1: per-plan activation — evaluate over the whole plan's task graph,
	// not just `phase`. The `phase` arg is what we then dispatch into Lean
	// Turbo, but the promote/demote decision applies plan-wide.
	const rawTasks: Array<{ id: string; files_touched?: string[] }> = [];
	for (const ph of plan.phases) {
		for (const task of ph.tasks) {
			rawTasks.push(task);
		}
	}
	const tasks: CouplingTask[] = rawTasks.map((task) => {
		const scopeFiles = _internals.readTaskScopes(directory, task.id);
		const scope: string[] = scopeFiles ?? task.files_touched ?? [];
		return { id: task.id, scope };
	});

	const { pairs, commitsObserved } =
		await _internals.getCoChangeData(directory);

	const verdict = _internals.decideEpicActivation(
		tasks,
		pairs,
		commitsObserved,
		{
			activationThreshold: effectiveThreshold,
			minCommitsForSignal,
			cochangeNpmiThreshold,
			cochangeMinCoChanges,
			extraHotModules,
		},
	);

	// Best-effort persist of the decision rationale. Evidence-write failure
	// alone is an audit-trail miss, not a safety issue — log and continue.
	try {
		_internals.appendPromotionEvidence(directory, {
			timestamp: new Date().toISOString(),
			sessionID,
			phase,
			verdict,
		});
	} catch (err) {
		logger.warn(
			`[epic_run_phase] promotion-evidence append failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	// Mirror the decision into the session state so `/swarm epic status` can
	// show the most recent rationale. Unlike the evidence write above, a
	// failure here means the durable state subsystem is broken (corrupt
	// file / fail-closed marker set) — fail closed and refuse to dispatch
	// rather than executing without reliable state.
	try {
		_internals.recordEpicDecision(directory, sessionID, {
			decidedAt: new Date().toISOString(),
			phase,
			decision: verdict.decision,
			p: verdict.p,
			blockingReasons: verdict.blockingReasons,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(
			`[epic_run_phase] recordEpicDecision failed, refusing to dispatch: ${msg}`,
		);
		return {
			success: false,
			verdict,
			reason: 'epic-state-unreadable',
			errors: [msg],
		};
	}

	if (verdict.decision === 'demote') {
		return {
			success: true,
			verdict,
			reason: 'demoted',
		};
	}

	// --- Promotion path: dispatch into LeanTurboRunner.
	const leanConfig =
		config.turbo?.strategy === 'lean' ? config.turbo.lean : undefined;
	let runResult: {
		ok: boolean;
		lanes?: LaneResult[];
		degradedTasks?: string[];
		serializedTasks?: string[];
		reason?: string;
	} | null = null;
	let runError: Error | null = null;
	let runner: InstanceType<typeof _internals.LeanTurboRunner> | null = null;
	try {
		runner = new _internals.LeanTurboRunner({
			directory,
			sessionID,
			opencodeClient: swarmState.opencodeClient ?? null,
			generatedAgentNames: swarmState.generatedAgentNames,
			leanConfig,
		});
		runResult = await runner.runPhase(phase);
	} catch (error) {
		runError = error instanceof Error ? error : new Error(String(error));
	}

	if (runner) {
		try {
			if (runError || !runResult?.ok) {
				await runner.cleanupAfterFailure();
			} else {
				await runner.cleanupAfterSuccess();
			}
		} catch (cleanupError) {
			logger.error(
				`[epic_run_phase] runner cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
			);
		}
	}

	if (runError) {
		return {
			success: false,
			verdict,
			reason: 'lean-runner-error',
			errors: [runError.message],
		};
	}

	return {
		success: runResult?.ok ?? false,
		verdict,
		lanes: runResult?.lanes,
		degradedTasks: runResult?.degradedTasks,
		serializedTasks: runResult?.serializedTasks,
		reason: 'promoted',
	};
}

export const epic_run_phase: ToolDefinition = createSwarmTool({
	description:
		'Execute a phase under Epic Mode (Capability C). Computes the plan-wide coupling coefficient p, gates on the activation threshold + hot-module check + greenfield rule, and either dispatches Lean Turbo for parallel execution (when promoted) or returns a "demoted to serial" verdict (when any gate fails). Persists decision rationale to .swarm/evidence/epic-promotions.jsonl. Use only when /swarm epic is on for the session.',
	args: {
		directory: z.string().describe('Project root directory'),
		phase: z.number().int().positive().describe('Phase number to execute'),
		sessionID: z.string().describe('Active session ID'),
	},
	execute: async (args: unknown, _directory: string) => {
		const { phase, sessionID } = args as EpicRunPhaseArgs;
		return JSON.stringify(
			await executeEpicRunPhase({
				phase,
				sessionID,
				directory: _directory,
			}),
			null,
			2,
		);
	},
});

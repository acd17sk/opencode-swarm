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
import { isGlobalFile, isProtectedPath } from '../lean/conflicts.js';
import type { CouplingTask } from './coupling-report.js';
import { computeCouplingReport } from './coupling-report.js';

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
export function decideEpicActivation(
	tasks: CouplingTask[],
	cochangePairs: CoChangeEntry[],
	commitsObserved: number,
	options: EpicActivationOptions,
): EpicActivationVerdict {
	// Edge case worth flagging: empty `tasks` produces a vacuous-promote
	// verdict (p=0, hot-module check has nothing to fail on, greenfield
	// still gated by commitsObserved). The caller is responsible for not
	// dispatching execution against an empty plan — the verdict itself is
	// honest about what it measured, just unusual.
	// --- Gate 3: greenfield. Evaluate first so we never trust a low p that
	// came from an empty / sparse history. (Order does not affect the final
	// decision because all three gates AND together; the order is just
	// readable.)
	const greenfieldPassed = commitsObserved >= options.minCommitsForSignal;

	// --- Gate 2: hot-module check. Reuses Lean Turbo's exported predicates
	// (no list duplication).
	const touchedHotModules = new Set<string>();
	for (const task of tasks) {
		for (const file of task.scope) {
			if (isGlobalFile(file) || isProtectedPath(file)) {
				touchedHotModules.add(file);
			}
		}
	}
	const hotPassed = touchedHotModules.size === 0;

	// --- Gate 1: p threshold. Compute via Capability B's report function
	// (which itself wraps Capability A's pair predicate).
	const report = computeCouplingReport(tasks, cochangePairs, {
		npmi: options.cochangeNpmiThreshold,
		minCoChanges: options.cochangeMinCoChanges,
	});
	const pPassed = report.p <= options.activationThreshold;

	const rationale: EpicActivationRationale = {
		pCheck: {
			passed: pPassed,
			p: report.p,
			threshold: options.activationThreshold,
		},
		hotModuleCheck: {
			passed: hotPassed,
			touchedHotModules: Array.from(touchedHotModules).sort(),
		},
		greenfieldCheck: {
			passed: greenfieldPassed,
			commitsObserved,
			minCommits: options.minCommitsForSignal,
		},
	};

	const blockingReasons: string[] = [];
	if (!pPassed) {
		blockingReasons.push(
			`p (${report.p.toFixed(3)}) exceeds activation threshold (${options.activationThreshold.toFixed(3)})`,
		);
	}
	if (!hotPassed) {
		const sample = rationale.hotModuleCheck.touchedHotModules.slice(0, 3);
		const more =
			rationale.hotModuleCheck.touchedHotModules.length > 3
				? `, +${rationale.hotModuleCheck.touchedHotModules.length - 3} more`
				: '';
		blockingReasons.push(
			`plan touches Lean Turbo hot module(s): ${sample.join(', ')}${more}`,
		);
	}
	if (!greenfieldPassed) {
		blockingReasons.push(
			`co-change history is sparse (${commitsObserved} commits observed, ${options.minCommitsForSignal} required) — signal is low-confidence (brief §4.2 greenfield rule)`,
		);
	}

	const decision: 'promote' | 'demote' =
		pPassed && hotPassed && greenfieldPassed ? 'promote' : 'demote';

	return {
		decision,
		p: report.p,
		rationale,
		blockingReasons,
	};
}

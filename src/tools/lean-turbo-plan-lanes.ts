/**
 * Lean Turbo Plan Lanes Tool.
 * Wraps planLeanTurboLanes from src/turbo/lean/planner.
 * Partitions phase tasks into parallel lanes based on file-scope conflicts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ToolDefinition } from '@opencode-ai/plugin/tool';
import { z } from 'zod';
import { loadPluginConfigWithMeta as loadPluginConfigWithMeta_import } from '../config';
import { DEFAULT_LEAN_TURBO_CONFIG } from '../config/constants';
import type { LeanTurboConfig } from '../config/schema';
import { isGitRepo as isGitRepo_import } from '../git/branch';
import {
	buildIsUpstreamCommitted as buildIsUpstreamCommitted_import,
	buildIsUpstreamCommittedWithStatus as buildIsUpstreamCommittedWithStatus_import,
} from '../turbo/epic/upstream-commits';
import type { LeanTurboLanePlan } from '../turbo/lean/planner';
import { type PlanPhase, planLeanTurboLanes } from '../turbo/lean/planner';
import { criticalWarn } from '../utils/logger.js';
import { createSwarmTool } from './create-tool';

/**
 * Arguments for the lean_turbo_plan_lanes tool
 */
export interface LeanTurboPlanLanesArgs {
	directory: string;
	phase: number;
	scopes?: Record<string, string[]>;
}

/**
 * Result from executing lean_turbo_plan_lanes
 */
export interface LeanTurboPlanLanesResult {
	success: boolean;
	plan?: LeanTurboLanePlan;
	lanes?: LeanTurboLanePlan['lanes'];
	degradedTasks?: LeanTurboLanePlan['degradedTasks'];
	serializedTasks?: LeanTurboLanePlan['serializedTasks'];
	errors?: string[];
}

/**
 * Read the plan.json file for a project.
 */
function readPlanJson(directory: string): { phases: PlanPhase[] } | null {
	const planPath = path.join(directory, '.swarm', 'plan.json');
	if (!fs.existsSync(planPath)) {
		return null;
	}
	try {
		return JSON.parse(fs.readFileSync(planPath, 'utf-8'));
	} catch {
		return null;
	}
}

/**
 * Execute the lean_turbo_plan_lanes tool.
 * Partitions phase tasks into parallel lanes based on file-scope conflicts.
 */
export async function executeLeanTurboPlanLanes(
	args: LeanTurboPlanLanesArgs,
): Promise<LeanTurboPlanLanesResult> {
	const { directory, phase, scopes } = args;

	// Read plan.json
	const plan = readPlanJson(directory);
	if (!plan) {
		return {
			success: false,
			errors: ['plan.json not found in .swarm directory'],
		};
	}

	// Honor user-set `turbo.lean.*` config knobs by loading the project's
	// plugin config and merging over the defaults. Parity with the Epic
	// wave planner's config-load path. Falls back to defaults on any load
	// failure (the common case is "no custom config" which is silent).
	let defaultConfig: LeanTurboConfig = { ...DEFAULT_LEAN_TURBO_CONFIG };
	try {
		const loaded = await _internals.loadPluginConfigWithMeta(directory);
		const userLean = loaded?.config?.turbo?.lean;
		if (userLean) {
			defaultConfig = { ...defaultConfig, ...userLean };
		}
	} catch {
		// Use defaults; load failure on a project without a custom config
		// is the common case and should not be a warning.
	}

	// Rule 3 of the greenfield-smart redesign: cross-batch deps are
	// parallel-eligible only when the upstream task is in git history.
	// Build the predicate when the project is git-backed; for non-git
	// projects (Rule 1), omit it so the planner falls back to the legacy
	// "dep not in batch ⇒ implicitly satisfied" semantics, which matches
	// the Rule 1 bypass intent (no git ⇒ no commit signal to require).
	//
	// Phase 13 (B22): use the status-bearing variant. The original
	// `buildIsUpstreamCommitted` degrades to `() => true` on git-log
	// failure — fine before Phase 10 (lane planner's wave ordering was
	// the backstop) but DANGEROUS now: `epic_decide_phase` (post-B10)
	// fails closed on `gitFailed`, but if git breaks transiently between
	// the architect's decide call and this lane-planning call, the
	// permissive fallback here would silently fan out cross-batch deps
	// without evidence — bypassing Phase 10's safety at the very next
	// call. Refuse to plan when git is broken so the architect can
	// retry once git is healthy.
	let isUpstreamCommitted: ((taskId: string) => boolean) | undefined;
	if (_internals.isGitRepo(directory)) {
		const evidence = _internals.buildIsUpstreamCommittedWithStatus(directory);
		if (evidence.gitFailed) {
			// Phase 14 (B30): plain user-facing message, no internal
			// phase references. Names the failed subsystem (git log
			// read) and gives an actionable remediation hint that
			// covers both transient (retry) and persistent (escape
			// hatch) failure modes. Architect can also fall back to
			// per-task serial via the `Task` tool directly if git
			// stays broken.
			//
			// Phase 14 (B28): audit-trail asymmetry note. If
			// `epic_decide_phase` succeeded earlier in the same
			// session (git was healthy then), `.swarm/evidence/
			// epic-promotions.jsonl` records `decision: 'promote'`
			// for this phase even though no parallel dispatch happens
			// here. This is correct AS A DECISION — the verdict was
			// computed honestly with the data available at decide
			// time — but post-run grading that infers "actual
			// parallelism happened" from the JSONL alone would
			// over-count. The warn log below is the correlation
			// signal: any "lane-planning blocked" line in the run
			// log marks a phase whose JSONL `promote` did NOT result
			// in real parallel work. Sessionless plumbing of a
			// corrective JSONL record would require threading
			// sessionID through this tool — deferred until any
			// benchmark consumer actually depends on it.
			// Phase 15 (B34): elevated to criticalWarn so the audit-trail
			// correlation signal actually reaches the operator's logs.
			// This line is the canonical detection point for the B22-wedge
			// scenario where decide already wrote `promote` to the JSONL
			// before plan_lanes refused.
			criticalWarn(
				`[lean_turbo_plan_lanes] lane-planning blocked for directory=${directory} phase=${phase}: git log scan failed. Any prior promote verdict in .swarm/evidence/epic-promotions.jsonl for this phase is not backed by actual parallel execution.`,
			);
			return {
				success: false,
				errors: [
					// Phase 15 (B37): replaced the "dispatch via Task tool
					// without going through this planner" advice — that
					// would skip the planner's file-scope conflict
					// detection and let two coders clobber each other on
					// overlapping scopes. Safe fallback is sequential
					// single-coder dispatch (no parallelism, but no
					// conflict risk).
					'lean_turbo_plan_lanes: cannot verify cross-batch upstream-commit evidence — `git log` read failed. Likely transient: retry once git is healthy (e.g. another process released its lock). If git is persistently broken (corrupt repo, permission issue, missing `.git`), repair the repository. Until repaired, complete the phase serially — one task at a time, waiting for each commit to land before dispatching the next — so file-scope conflict detection is not required.',
				],
			};
		}
		isUpstreamCommitted = evidence.predicate;
	}

	try {
		const lanePlan = planLeanTurboLanes(
			directory,
			phase,
			plan,
			defaultConfig,
			scopes,
			isUpstreamCommitted,
		);

		return {
			success: true,
			plan: lanePlan,
			lanes: lanePlan.lanes,
			degradedTasks: lanePlan.degradedTasks,
			serializedTasks: lanePlan.serializedTasks,
		};
	} catch (error) {
		// Phase 16 (C1.H2): emit a CRITICAL-WARN so the lane-planning-
		// blocked signal isn't silent on non-git-fail throws. Phase 14
		// added a criticalWarn for the `gitFailed` branch only; this
		// catch covers planner-internal throws (corrupt scopes, malformed
		// plan downstream of readPlanJson, etc.) that share the same
		// "no parallel work happened" consequence for any prior promote
		// verdict in the JSONL.
		const errMsg = error instanceof Error ? error.message : String(error);
		criticalWarn(
			`[lean_turbo_plan_lanes] lane-planning failed for directory=${directory} phase=${phase}: ${errMsg}. Any prior promote verdict in .swarm/evidence/epic-promotions.jsonl for this phase is not backed by actual parallel execution.`,
		);
		return {
			success: false,
			errors: [errMsg],
		};
	}
}

/**
 * DI seam — production code routes git-detection and predicate
 * construction through `_internals` so tests can substitute
 * deterministic doubles without `mock.module` (AGENTS.md invariant 7).
 */
export const _internals = {
	isGitRepo: (cwd: string): boolean => isGitRepo_import(cwd),
	buildIsUpstreamCommitted: (cwd: string): ((taskId: string) => boolean) =>
		buildIsUpstreamCommitted_import(cwd),
	buildIsUpstreamCommittedWithStatus: buildIsUpstreamCommittedWithStatus_import,
	loadPluginConfigWithMeta: loadPluginConfigWithMeta_import,
};

/**
 * Tool definition for lean_turbo_plan_lanes
 */
export const lean_turbo_plan_lanes: ToolDefinition = createSwarmTool({
	description:
		'Partition phase tasks into parallel lanes based on file-scope conflicts. ' +
		'Wraps planLeanTurboLanes for Lean Turbo lane planning.',
	args: {
		directory: z
			.string()
			.describe('Project root directory where .swarm/plan.json is located'),
		phase: z.number().int().positive().describe('Phase number to plan'),
		scopes: z
			.record(z.string(), z.array(z.string()))
			.optional()
			.describe('Optional pre-loaded scopes map (taskId -> file paths)'),
	},
	execute: async (args: unknown, _directory: string) => {
		const parsed = args as LeanTurboPlanLanesArgs;
		// Use _directory from tool context for .swarm containment (invariant #4)
		return JSON.stringify(
			await executeLeanTurboPlanLanes({ ...parsed, directory: _directory }),
			null,
			2,
		);
	},
});

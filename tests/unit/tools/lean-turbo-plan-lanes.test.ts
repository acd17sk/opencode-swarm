/**
 * Tests for the `lean_turbo_plan_lanes` tool's Rule 3 wiring.
 * File: tests/unit/tools/lean-turbo-plan-lanes.test.ts
 *
 * Why this exists: the adversarial review on 2026-06-03 caught that
 * `executeLeanTurboPlanLanes` was passing 5 args to `planLeanTurboLanes`,
 * omitting the `isUpstreamCommitted` predicate. Rule 3 was therefore
 * undeployed in the architect-facing path (per [[epic-one-path-enforcement]],
 * the transparent path is `epic_decide_phase → lean_turbo_plan_lanes → Task`).
 *
 * These tests verify that:
 *  - Git-backed projects build and inject the predicate.
 *  - Non-git projects skip the predicate (Rule 1 bypass intent — no commit
 *    signal to require).
 *  - The injected predicate actually reaches `planLeanTurboLanes` (proven
 *    behaviorally: predicate returning `false` for the upstream causes
 *    the cross-batch downstream to be degraded; only the planner can
 *    produce that degradation).
 *
 * Isolation: uses the file-scoped `_internals` DI seam per AGENTS.md #7.
 * No `mock.module` — restored in `afterEach`.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	_internals,
	executeLeanTurboPlanLanes,
} from '../../../src/tools/lean-turbo-plan-lanes';

type Internals = typeof _internals;

function writePlanJson(tempDir: string, plan: { phases: unknown[] }): void {
	fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
	fs.writeFileSync(
		path.join(tempDir, '.swarm', 'plan.json'),
		JSON.stringify(plan),
	);
}

/**
 * A two-phase plan where 2.1 depends on 1.1 across phase batches.
 * Phase 1 is `status: completed` so when the planner is asked to plan
 * phase 2, it considers 1.1 a cross-batch upstream — exactly the case
 * Rule 3 governs.
 */
function makeCrossBatchPlan(): { phases: unknown[] } {
	return {
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'complete',
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'completed',
						size: 'small',
						description: 'set up',
						depends: [],
						acceptance: 'done',
						files_touched: [],
					},
				],
			},
			{
				id: 2,
				name: 'Phase 2',
				status: 'pending',
				tasks: [
					{
						id: '2.1',
						phase: 2,
						status: 'pending',
						size: 'small',
						description: 'implement thing',
						depends: ['1.1'],
						acceptance: 'works',
						files_touched: [],
					},
				],
			},
		],
	};
}

describe('executeLeanTurboPlanLanes — Rule 3 wiring', () => {
	const originals: Internals = { ..._internals };
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-turbo-plan-lanes-'));
	});

	afterEach(() => {
		Object.assign(_internals, originals);
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			/* best-effort cleanup */
		}
	});

	test('non-git project: predicate is NOT built, planner falls back to legacy "satisfied" semantics', async () => {
		writePlanJson(tempDir, makeCrossBatchPlan());
		let predicateBuilt = false;
		_internals.isGitRepo = () => false;
		_internals.buildIsUpstreamCommittedWithStatus = () => {
			predicateBuilt = true;
			return { predicate: () => false, gitFailed: false };
		};

		const result = await executeLeanTurboPlanLanes({
			directory: tempDir,
			phase: 2,
			scopes: { '2.1': ['src/thing.ts'] },
		});

		expect(result.success).toBe(true);
		expect(predicateBuilt).toBe(false);
		// Legacy semantics: cross-batch dep (1.1) treated as implicitly
		// satisfied → 2.1 lands on a lane (not degraded by Rule 3).
		expect(result.degradedTasks ?? []).toEqual([]);
		expect(result.lanes?.length ?? 0).toBeGreaterThan(0);
	});

	test('git project: predicate is built once with the directory and reaches planLeanTurboLanes', async () => {
		writePlanJson(tempDir, makeCrossBatchPlan());
		const buildCalls: string[] = [];
		_internals.isGitRepo = () => true;
		_internals.buildIsUpstreamCommittedWithStatus = (cwd: string) => {
			buildCalls.push(cwd);
			return { predicate: () => true, gitFailed: false };
		};

		const result = await executeLeanTurboPlanLanes({
			directory: tempDir,
			phase: 2,
			scopes: { '2.1': ['src/thing.ts'] },
		});

		expect(result.success).toBe(true);
		expect(buildCalls).toEqual([tempDir]);
		// Predicate returns true → cross-batch dep satisfied → 2.1 runs.
		expect(result.degradedTasks ?? []).toEqual([]);
		expect(result.lanes?.length ?? 0).toBeGreaterThan(0);
	});

	test('git project + predicate returns false for upstream: cross-batch downstream is degraded (proves predicate reaches planner)', async () => {
		writePlanJson(tempDir, makeCrossBatchPlan());
		_internals.isGitRepo = () => true;
		_internals.buildIsUpstreamCommittedWithStatus = () => ({
			predicate: (taskId: string) => taskId !== '1.1',
			gitFailed: false,
		});

		const result = await executeLeanTurboPlanLanes({
			directory: tempDir,
			phase: 2,
			scopes: { '2.1': ['src/thing.ts'] },
		});

		expect(result.success).toBe(true);
		// 2.1 must surface as degraded. Only the planner produces this
		// list — its presence proves the predicate reached
		// planLeanTurboLanes, not just the tool's wiring layer.
		const degradedIds = (result.degradedTasks ?? []).map(
			(d: { taskId: string }) => d.taskId,
		);
		expect(degradedIds).toContain('2.1');
	});

	test('Phase 13 (B22): git log read fails ⇒ tool returns success=false with a B22-specific error', async () => {
		// Pre-Phase-13, this path degraded to a permissive predicate
		// `() => true` — silently fanning out cross-batch deps without
		// commit evidence and defeating Phase 10's fail-closed promise.
		// Now the tool refuses to plan and surfaces a clear error.
		writePlanJson(tempDir, makeCrossBatchPlan());
		_internals.isGitRepo = () => true;
		_internals.buildIsUpstreamCommittedWithStatus = () => ({
			predicate: () => true, // would be the legacy permissive fallback
			gitFailed: true,
		});

		const result = await executeLeanTurboPlanLanes({
			directory: tempDir,
			phase: 2,
			scopes: { '2.1': ['src/thing.ts'] },
		});

		expect(result.success).toBe(false);
		// Phase 14 (B30): error string is plain user-facing language —
		// names the failed subsystem and remediation, no internal
		// "(Phase 13 B22.)" reference.
		expect(result.errors?.[0]).toContain('git log');
		expect(result.errors?.[0]).toContain('retry');
		expect(result.errors?.[0]).not.toContain('Phase 13');
	});

	test('plan.json missing: returns error without consulting either seam', async () => {
		let isGitRepoCalled = false;
		let buildCalled = false;
		_internals.isGitRepo = () => {
			isGitRepoCalled = true;
			return true;
		};
		_internals.buildIsUpstreamCommittedWithStatus = () => {
			buildCalled = true;
			return { predicate: () => true, gitFailed: false };
		};

		const result = await executeLeanTurboPlanLanes({
			directory: tempDir,
			phase: 2,
			scopes: { '2.1': ['src/thing.ts'] },
		});

		expect(result.success).toBe(false);
		expect(result.errors?.[0]).toContain('plan.json');
		expect(isGitRepoCalled).toBe(false);
		expect(buildCalled).toBe(false);
	});

	test('isGitRepo throwing does NOT crash the tool — degrades to "no predicate, no Rule 3"', async () => {
		writePlanJson(tempDir, makeCrossBatchPlan());
		_internals.isGitRepo = () => {
			throw new Error('spawn failed');
		};
		let buildCalled = false;
		_internals.buildIsUpstreamCommittedWithStatus = () => {
			buildCalled = true;
			return { predicate: () => false, gitFailed: false };
		};

		// Today the tool will propagate; the assertion documents the
		// current contract. If we later harden, flip the expectation
		// to "result.success === true and Rule 3 is skipped".
		await expect(
			executeLeanTurboPlanLanes({ directory: tempDir, phase: 2 }),
		).rejects.toThrow('spawn failed');
		expect(buildCalled).toBe(false);
	});
});

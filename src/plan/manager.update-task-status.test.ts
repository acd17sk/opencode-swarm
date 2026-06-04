import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Plan } from '../config/plan-schema';
import { _internals, loadPlan, savePlan, updateTaskStatus } from './manager';

type Internals = typeof _internals;

function makePlan(): Plan {
	return {
		schema_version: '1.0.0',
		title: 'Status Derivation Test Plan',
		swarm: 'test-swarm',
		current_phase: 1,
		phases: [
			{
				id: 1,
				name: 'Phase 1',
				status: 'pending',
				tasks: [
					{
						id: '1.1',
						phase: 1,
						status: 'pending',
						size: 'small',
						description: 'First task',
						depends: [],
						files_touched: [],
					},
					{
						id: '1.2',
						phase: 1,
						status: 'pending',
						size: 'small',
						description: 'Second task',
						depends: [],
						files_touched: [],
					},
				],
			},
		],
		migration_status: 'native',
	};
}

describe('updateTaskStatus phase status derivation', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-status-test-'));
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		await savePlan(tempDir, makePlan());
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('sets phase to in_progress when first task becomes in_progress', async () => {
		const updated = await updateTaskStatus(tempDir, '1.1', 'in_progress');

		expect(updated.phases[0].status).toBe('in_progress');
	});

	it('sets phase to complete when all tasks are completed', async () => {
		await updateTaskStatus(tempDir, '1.1', 'completed');
		const updated = await updateTaskStatus(tempDir, '1.2', 'completed');

		expect(updated.phases[0].status).toBe('complete');
	});

	it('returns phase to pending when no task is in_progress/blocked and not all are completed', async () => {
		await updateTaskStatus(tempDir, '1.1', 'in_progress');
		const updated = await updateTaskStatus(tempDir, '1.1', 'pending');

		expect(updated.phases[0].status).toBe('pending');

		const reloaded = await loadPlan(tempDir);
		expect(reloaded?.phases[0].status).toBe('pending');
	});

	// Regression test: downgrading completed → pending must actually persist.
	//
	// Root cause: updateTaskStatus previously called savePlan with
	// preserveCompletedStatuses:true, which caused savePlan to re-read disk,
	// see the task as 'completed', and silently override the caller's explicit
	// request back to 'completed'.  The function returned success (with the
	// requested status in its return value) but disk still had 'completed',
	// producing a silent false-positive that confused LLM agents trying to
	// reset task status for re-planning.
	it('regression: downgrading completed → pending is persisted to disk (not silently overridden)', async () => {
		// Mark both tasks completed so phase becomes complete
		await updateTaskStatus(tempDir, '1.1', 'completed');
		await updateTaskStatus(tempDir, '1.2', 'completed');

		// Downgrade task 1.1 back to pending
		const returned = await updateTaskStatus(tempDir, '1.1', 'pending');

		// The returned plan must reflect the new status
		const task11Returned = returned.phases[0].tasks.find((t) => t.id === '1.1');
		expect(task11Returned?.status).toBe('pending');

		// CRITICAL: disk must also reflect the new status — not silently remain 'completed'
		const reloaded = await loadPlan(tempDir);
		const task11OnDisk = reloaded?.phases[0].tasks.find((t) => t.id === '1.1');
		expect(task11OnDisk?.status).toBe('pending');

		// Phase is 'pending': task 1.1 is pending, task 1.2 is completed, none are in_progress
		expect(reloaded?.phases[0].status).toBe('pending');
	});

	// Regression test: downgrading completed → in_progress must also persist.
	it('regression: downgrading completed → in_progress is persisted to disk', async () => {
		await updateTaskStatus(tempDir, '1.1', 'completed');

		const returned = await updateTaskStatus(tempDir, '1.1', 'in_progress');

		const task11Returned = returned.phases[0].tasks.find((t) => t.id === '1.1');
		expect(task11Returned?.status).toBe('in_progress');

		const reloaded = await loadPlan(tempDir);
		const task11OnDisk = reloaded?.phases[0].tasks.find((t) => t.id === '1.1');
		expect(task11OnDisk?.status).toBe('in_progress');
	});

	// Verify that other tasks' completed status is still preserved when a
	// DIFFERENT task is updated (no unintended regression on sibling tasks).
	it('downgrading one task does not reset sibling completed tasks', async () => {
		await updateTaskStatus(tempDir, '1.1', 'completed');
		await updateTaskStatus(tempDir, '1.2', 'completed');

		// Reset only 1.1 — 1.2 must remain completed
		await updateTaskStatus(tempDir, '1.1', 'pending');

		const reloaded = await loadPlan(tempDir);
		const task12OnDisk = reloaded?.phases[0].tasks.find((t) => t.id === '1.2');
		expect(task12OnDisk?.status).toBe('completed');
	});
});

describe('updateTaskStatus Rule 2 auto-commit centralization', () => {
	const originals: Internals = { ..._internals };
	let tempDir: string;
	let commitCalls: Array<{
		directory: string;
		taskId: string;
		description?: string;
		scopePaths?: string[];
	}>;

	beforeEach(async () => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-rule2-test-'));
		fs.mkdirSync(path.join(tempDir, '.swarm'), { recursive: true });
		await savePlan(tempDir, makePlan());
		commitCalls = [];
		// Default: stub the commit seam so no real git ops fire.
		// Phase 11: commitTaskCompletion is async; the stub matches.
		_internals.commitTaskCompletion = async (
			directory: string,
			taskId: string,
			description?: string,
			scopePaths?: string[],
		) => {
			commitCalls.push({ directory, taskId, description, scopePaths });
			return { committed: true, reason: 'success', sha: 'fakesha' };
		};
	});

	afterEach(() => {
		Object.assign(_internals, originals);
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('fires commitTaskCompletion exactly once when status=completed AND Epic active AND git repo', async () => {
		_internals.isGitRepo = () => true;
		_internals.isEpicModeActiveForProject = () => true;
		_internals.readTaskScopes = () => ['src/foo.ts'];

		await updateTaskStatus(tempDir, '1.1', 'completed');

		expect(commitCalls).toHaveLength(1);
		expect(commitCalls[0].taskId).toBe('1.1');
		expect(commitCalls[0].description).toBe('First task');
		expect(commitCalls[0].scopePaths).toEqual(['src/foo.ts']);
	});

	it('does NOT fire commitTaskCompletion when Epic Mode is inactive for the project', async () => {
		_internals.isGitRepo = () => true;
		_internals.isEpicModeActiveForProject = () => false;

		await updateTaskStatus(tempDir, '1.1', 'completed');

		expect(commitCalls).toHaveLength(0);
	});

	it('does NOT fire commitTaskCompletion when project is not a git repo (Rule 1 bypass)', async () => {
		_internals.isGitRepo = () => false;
		_internals.isEpicModeActiveForProject = () => true;

		await updateTaskStatus(tempDir, '1.1', 'completed');

		expect(commitCalls).toHaveLength(0);
	});

	it('does NOT fire commitTaskCompletion on non-completed transitions (in_progress, pending, blocked)', async () => {
		_internals.isGitRepo = () => true;
		_internals.isEpicModeActiveForProject = () => true;

		await updateTaskStatus(tempDir, '1.1', 'in_progress');
		await updateTaskStatus(tempDir, '1.1', 'pending');
		await updateTaskStatus(tempDir, '1.1', 'blocked');

		expect(commitCalls).toHaveLength(0);
	});

	it('commit failure is non-fatal — updateTaskStatus still returns the updated plan', async () => {
		_internals.isGitRepo = () => true;
		_internals.isEpicModeActiveForProject = () => true;
		_internals.commitTaskCompletion = async () => {
			throw new Error('git index locked');
		};

		const updated = await updateTaskStatus(tempDir, '1.1', 'completed');

		// Durable write succeeded — plan ledger is authoritative (AGENTS.md #5).
		expect(updated.phases[0].tasks.find((t) => t.id === '1.1')?.status).toBe(
			'completed',
		);
		const reloaded = await loadPlan(tempDir);
		expect(reloaded?.phases[0].tasks.find((t) => t.id === '1.1')?.status).toBe(
			'completed',
		);
	});

	it('scope source is .swarm/scopes/scope-<id>.json (NOT plan-ledger files_touched)', async () => {
		_internals.isGitRepo = () => true;
		_internals.isEpicModeActiveForProject = () => true;
		// Even if the plan-ledger had files_touched set, we do NOT consult
		// it — the ledger replay path in loadPlan overrides savePlan
		// mutations, so any "fallback" would be reading stale data.
		_internals.readTaskScopes = (_dir: string, taskId: string) => {
			if (taskId === '1.1') return ['src/canonical.ts'];
			return null;
		};

		await updateTaskStatus(tempDir, '1.1', 'completed');

		expect(commitCalls[0].scopePaths).toEqual(['src/canonical.ts']);
	});

	it('passes undefined scope when scope-<id>.json is missing (marker-only commit)', async () => {
		_internals.isGitRepo = () => true;
		_internals.isEpicModeActiveForProject = () => true;
		_internals.readTaskScopes = () => null;

		await updateTaskStatus(tempDir, '1.1', 'completed');

		expect(commitCalls).toHaveLength(1);
		expect(commitCalls[0].scopePaths).toBeUndefined();
	});
});

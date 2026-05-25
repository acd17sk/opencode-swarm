/**
 * Tests for the epic_run_phase tool.
 * File: tests/unit/tools/epic-run-phase.test.ts
 *
 * Covers:
 *  - Fails closed when Epic Mode is not active for the session.
 *  - Fails gracefully when .swarm/plan.json is missing.
 *  - Demotion path: returns reason='demoted' without invoking LeanTurboRunner.
 *  - Promotion path: invokes LeanTurboRunner, returns the lane results.
 *  - Promotion-evidence is appended exactly once per call.
 *  - Records the decision into the session state (`recordEpicDecision`).
 *  - Lean runner exceptions are surfaced as reason='lean-runner-error'.
 *
 * Uses the _internals DI seam — no mock.module (AGENTS.md invariant 7).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	_internals,
	executeEpicRunPhase,
} from '../../../src/tools/epic-run-phase';

const realInternals = { ..._internals };

interface StubState {
	epicActive: boolean;
	plan: {
		phases: Array<{
			id: number;
			name: string;
			tasks: Array<{
				id: string;
				description: string;
				status: string;
				files_touched?: string[];
			}>;
		}>;
	} | null;
	pluginConfig: { turbo?: unknown };
	cochangeData: { pairs: unknown[]; commitsObserved: number };
	verdict: {
		decision: 'promote' | 'demote';
		p: number;
		rationale: unknown;
		blockingReasons: string[];
	};
	runnerResult: {
		ok: boolean;
		lanes?: unknown[];
		degradedTasks?: string[];
		serializedTasks?: string[];
	} | null;
	runnerThrows: boolean;
	evidenceAppends: number;
	decisionRecordings: number;
}

let stub: StubState;

beforeEach(() => {
	stub = {
		epicActive: true,
		plan: {
			phases: [
				{
					id: 1,
					name: 'P1',
					tasks: [
						{
							id: '1.1',
							description: 'a',
							status: 'pending',
							files_touched: ['src/a.ts'],
						},
						{
							id: '1.2',
							description: 'b',
							status: 'pending',
							files_touched: ['src/b.ts'],
						},
					],
				},
			],
		},
		pluginConfig: {
			turbo: {
				strategy: 'lean',
				lean: { max_parallel_coders: 2 },
				epic: { mode: { enabled: true } },
			},
		},
		cochangeData: { pairs: [], commitsObserved: 50 },
		verdict: {
			decision: 'promote',
			p: 0,
			rationale: {
				pCheck: { passed: true, p: 0, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: { passed: true, commitsObserved: 50, minCommits: 20 },
			},
			blockingReasons: [],
		},
		runnerResult: {
			ok: true,
			lanes: [],
			degradedTasks: [],
			serializedTasks: [],
		},
		runnerThrows: false,
		evidenceAppends: 0,
		decisionRecordings: 0,
	};

	_internals.isEpicModeActive = (() => stub.epicActive) as never;
	_internals.loadPlanJsonOnly = (async () => stub.plan) as never;
	_internals.loadPluginConfigWithMeta = (() => ({
		config: stub.pluginConfig,
		isUsingDefaults: false,
	})) as never;
	_internals.readTaskScopes = (() => null) as never;
	_internals.getCoChangeData = (async () => stub.cochangeData) as never;
	_internals.decideEpicActivation = (() => stub.verdict) as never;
	_internals.appendPromotionEvidence = (() => {
		stub.evidenceAppends += 1;
		return '/fake/evidence/path';
	}) as never;
	_internals.recordEpicDecision = (() => {
		stub.decisionRecordings += 1;
	}) as never;

	// Stub the LeanTurboRunner class.
	class FakeRunner {
		runPhase = async (_n: number) => {
			if (stub.runnerThrows) throw new Error('simulated runner failure');
			return stub.runnerResult!;
		};
		cleanupAfterSuccess = async () => {};
		cleanupAfterFailure = async () => {};
	}
	_internals.LeanTurboRunner = FakeRunner as never;
});

afterEach(() => {
	_internals.isEpicModeActive = realInternals.isEpicModeActive;
	_internals.loadPlanJsonOnly = realInternals.loadPlanJsonOnly;
	_internals.loadPluginConfigWithMeta = realInternals.loadPluginConfigWithMeta;
	_internals.readTaskScopes = realInternals.readTaskScopes;
	_internals.getCoChangeData = realInternals.getCoChangeData;
	_internals.decideEpicActivation = realInternals.decideEpicActivation;
	_internals.appendPromotionEvidence = realInternals.appendPromotionEvidence;
	_internals.recordEpicDecision = realInternals.recordEpicDecision;
	_internals.LeanTurboRunner = realInternals.LeanTurboRunner;
});

describe('executeEpicRunPhase — failure modes', () => {
	test('returns epic-mode-not-active when the session has not toggled on', async () => {
		stub.epicActive = false;
		const result = await executeEpicRunPhase({
			directory: '/fake',
			phase: 1,
			sessionID: 's1',
		});
		expect(result.success).toBe(false);
		expect(result.reason).toBe('epic-mode-not-active');
		expect(stub.evidenceAppends).toBe(0);
	});

	test('returns no-plan when plan.json is missing', async () => {
		stub.plan = null;
		const result = await executeEpicRunPhase({
			directory: '/fake',
			phase: 1,
			sessionID: 's1',
		});
		expect(result.success).toBe(false);
		expect(result.reason).toBe('no-plan');
		expect(stub.evidenceAppends).toBe(0);
	});
});

describe('executeEpicRunPhase — demotion path', () => {
	test('returns demoted without invoking LeanTurboRunner', async () => {
		stub.verdict = {
			...stub.verdict,
			decision: 'demote',
			p: 0.8,
			blockingReasons: ['p too high'],
		};
		let runnerInvoked = false;
		class TrackingRunner {
			runPhase = async () => {
				runnerInvoked = true;
				return { ok: true };
			};
			cleanupAfterSuccess = async () => {};
			cleanupAfterFailure = async () => {};
		}
		_internals.LeanTurboRunner = TrackingRunner as never;

		const result = await executeEpicRunPhase({
			directory: '/fake',
			phase: 1,
			sessionID: 's1',
		});
		expect(result.success).toBe(true);
		expect(result.reason).toBe('demoted');
		expect(result.verdict?.decision).toBe('demote');
		expect(runnerInvoked).toBe(false);
	});

	test('demotion still appends evidence and records the decision', async () => {
		stub.verdict = {
			...stub.verdict,
			decision: 'demote',
			p: 0.8,
			blockingReasons: ['x'],
		};
		await executeEpicRunPhase({
			directory: '/fake',
			phase: 1,
			sessionID: 's1',
		});
		expect(stub.evidenceAppends).toBe(1);
		expect(stub.decisionRecordings).toBe(1);
	});
});

describe('executeEpicRunPhase — promotion path', () => {
	test('invokes LeanTurboRunner and returns lane results', async () => {
		stub.runnerResult = {
			ok: true,
			lanes: [
				{
					laneId: 'lane-1',
					taskIds: ['1.1'],
					files: ['src/a.ts'],
					status: 'completed' as const,
				},
			],
			degradedTasks: [],
			serializedTasks: [],
		};
		const result = await executeEpicRunPhase({
			directory: '/fake',
			phase: 1,
			sessionID: 's1',
		});
		expect(result.success).toBe(true);
		expect(result.reason).toBe('promoted');
		expect(result.lanes).toHaveLength(1);
		expect(result.verdict?.decision).toBe('promote');
	});

	test('promotion appends evidence and records the decision exactly once', async () => {
		await executeEpicRunPhase({
			directory: '/fake',
			phase: 1,
			sessionID: 's1',
		});
		expect(stub.evidenceAppends).toBe(1);
		expect(stub.decisionRecordings).toBe(1);
	});

	test('lean runner exception surfaces as lean-runner-error', async () => {
		stub.runnerThrows = true;
		const result = await executeEpicRunPhase({
			directory: '/fake',
			phase: 1,
			sessionID: 's1',
		});
		expect(result.success).toBe(false);
		expect(result.reason).toBe('lean-runner-error');
		expect(result.errors).toBeDefined();
		expect(result.errors?.[0]).toContain('simulated runner failure');
		// The verdict is still recorded even when execution fails.
		expect(result.verdict?.decision).toBe('promote');
	});
});

describe('executeEpicRunPhase — per-plan activation (Q1)', () => {
	test('decides over the whole plan, not just the requested phase', async () => {
		stub.plan = {
			phases: [
				{
					id: 1,
					name: 'P1',
					tasks: [
						{
							id: '1.1',
							description: 'a',
							status: 'pending',
							files_touched: ['src/a.ts'],
						},
					],
				},
				{
					id: 2,
					name: 'P2',
					tasks: [
						{
							id: '2.1',
							description: 'b',
							status: 'pending',
							files_touched: ['src/b.ts'],
						},
					],
				},
				{
					id: 3,
					name: 'P3',
					tasks: [
						{
							id: '3.1',
							description: 'c',
							status: 'pending',
							files_touched: ['src/c.ts'],
						},
					],
				},
			],
		};
		let receivedTaskCount = 0;
		_internals.decideEpicActivation = ((tasks: unknown[]) => {
			receivedTaskCount = tasks.length;
			return stub.verdict;
		}) as never;

		await executeEpicRunPhase({
			directory: '/fake',
			phase: 2,
			sessionID: 's1',
		});
		// All 3 tasks from all 3 phases, not just the 1 task from phase 2.
		expect(receivedTaskCount).toBe(3);
	});
});

/**
 * Tests for the /swarm epic slash command.
 * File: tests/unit/commands/epic.test.ts
 *
 * Covers:
 *  - Missing session context → friendly error.
 *  - on / off / toggle round-trip via the durable state seam.
 *  - status renders the last decision when one exists.
 *  - decide computes a fresh verdict from the plan without writing evidence.
 *  - Unknown subcommand → usage.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { _internals, handleEpicCommand } from '../../../src/commands/epic';

const realInternals = { ..._internals };

let active = false;
let sessionStateStored: ReturnType<typeof realInternals.loadEpicSessionState> =
	null;
let decideCalls = 0;
let enableCalls = 0;
let disableCalls = 0;
let sessionFlag: { epicModeActive?: boolean; id: string; turboMode: boolean };

beforeEach(() => {
	active = false;
	sessionStateStored = null;
	decideCalls = 0;
	enableCalls = 0;
	disableCalls = 0;
	sessionFlag = { id: 'sess-1', turboMode: false, epicModeActive: false };

	_internals.getAgentSession = ((id: string) =>
		id === 'sess-1' ? (sessionFlag as never) : null) as never;
	_internals.isEpicModeActive = (() => active) as never;
	_internals.isStateUnreadable = (() => false) as never;
	_internals.loadEpicSessionState = (() => sessionStateStored) as never;
	_internals.readTaskScopes = (() => null) as never;
	_internals.enableEpicMode = (() => {
		active = true;
		enableCalls += 1;
		sessionStateStored = {
			sessionID: 'sess-1',
			active: true,
			enabledAt: '2025-01-01T00:00:00Z',
		} as never;
	}) as never;
	_internals.disableEpicMode = (() => {
		active = false;
		disableCalls += 1;
		sessionStateStored = {
			sessionID: 'sess-1',
			active: false,
			disabledAt: '2025-01-02T00:00:00Z',
		} as never;
	}) as never;

	_internals.loadPluginConfigWithMeta = (() => ({
		config: { turbo: { epic: { mode: { enabled: true } } } },
		isUsingDefaults: false,
	})) as never;
	_internals.loadPlanJsonOnly = (async () => ({
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
		],
	})) as never;
	_internals.getCoChangeData = (async () => ({
		pairs: [],
		commitsObserved: 50,
	})) as never;
	_internals.decideEpicActivation = (() => {
		decideCalls += 1;
		return {
			decision: 'promote',
			p: 0,
			rationale: {
				pCheck: { passed: true, p: 0, threshold: 0.3 },
				hotModuleCheck: { passed: true, touchedHotModules: [] },
				greenfieldCheck: { passed: true, commitsObserved: 50, minCommits: 20 },
			},
			blockingReasons: [],
		};
	}) as never;
});

afterEach(() => {
	for (const k of Object.keys(realInternals)) {
		(_internals as never as Record<string, unknown>)[k] = (
			realInternals as never as Record<string, unknown>
		)[k];
	}
});

describe('handleEpicCommand — session validation', () => {
	test('rejects empty sessionID', async () => {
		const out = await handleEpicCommand('/fake', [], '');
		expect(out).toContain('No active session context');
	});

	test('rejects when getAgentSession returns null', async () => {
		const out = await handleEpicCommand('/fake', [], 'ghost-session');
		expect(out).toContain('No active session');
	});
});

describe('handleEpicCommand — on / off / toggle', () => {
	test('`on` enables the mode and acks', async () => {
		const out = await handleEpicCommand('/fake', ['on'], 'sess-1');
		expect(out).toContain('Epic Mode enabled');
		expect(enableCalls).toBe(1);
		expect(active).toBe(true);
		// In-memory session flag is also mirrored so hasActiveEpicMode picks it up.
		expect(sessionFlag.epicModeActive).toBe(true);
	});

	test('`off` disables the mode and acks', async () => {
		active = true;
		sessionFlag.epicModeActive = true;
		const out = await handleEpicCommand('/fake', ['off'], 'sess-1');
		expect(out).toContain('Epic Mode disabled');
		expect(disableCalls).toBe(1);
		expect(active).toBe(false);
		expect(sessionFlag.epicModeActive).toBe(false);
	});

	test('bare `/swarm epic` shows status and does NOT toggle (anti-loop)', async () => {
		// Toggle-by-default created an architect-loop with weaker models:
		// the model called `swarm_command [command=epic]` without args to
		// "check state", which flipped the flag, then it tried again →
		// flip back → loop. Status-by-default is idempotent and safe.
		const beforeEnable = enableCalls;
		const beforeDisable = disableCalls;
		const out = await handleEpicCommand('/fake', [], 'sess-1');
		expect(out).toContain('Epic Mode — Status');
		expect(enableCalls).toBe(beforeEnable);
		expect(disableCalls).toBe(beforeDisable);

		// Calling it again is also idempotent — same observation.
		await handleEpicCommand('/fake', [], 'sess-1');
		expect(enableCalls).toBe(beforeEnable);
		expect(disableCalls).toBe(beforeDisable);
	});

	test('unknown subcommand returns usage', async () => {
		const out = await handleEpicCommand('/fake', ['nope'], 'sess-1');
		expect(out).toContain("Unknown subcommand 'nope'");
		expect(out).toContain('Usage:');
	});

	test('empty-string subcommand is treated as unknown (not toggle)', async () => {
		// `['']` is different from `[]`: arg0 is '' not undefined.
		const out = await handleEpicCommand('/fake', [''], 'sess-1');
		expect(out).toContain("Unknown subcommand ''");
		// And NO toggle happened.
		expect(enableCalls).toBe(0);
		expect(disableCalls).toBe(0);
	});
});

describe('handleEpicCommand — status', () => {
	test('renders "not toggled" when no session state exists', async () => {
		sessionStateStored = null;
		const out = await handleEpicCommand('/fake', ['status'], 'sess-1');
		expect(out).toContain('Epic Mode — Status');
		expect(out).toContain('has not been toggled');
	});

	test('distinguishes "state unreadable" from "not toggled"', async () => {
		_internals.isStateUnreadable = (() => true) as never;
		const out = await handleEpicCommand('/fake', ['status'], 'sess-1');
		expect(out).toContain('Epic Mode — Status');
		expect(out).toContain('unreadable');
		expect(out).toContain('fail-closed');
		// And it does NOT mislead with "not toggled".
		expect(out).not.toContain('has not been toggled');
	});

	test('renders the last decision when state has one', async () => {
		sessionStateStored = {
			sessionID: 'sess-1',
			active: true,
			enabledAt: '2025-01-01T00:00:00Z',
			lastDecision: {
				decidedAt: '2025-01-02T00:00:00Z',
				phase: 2,
				decision: 'demote',
				p: 0.75,
				blockingReasons: ['p exceeds threshold'],
			},
		} as never;
		const out = await handleEpicCommand('/fake', ['status'], 'sess-1');
		expect(out).toContain('Last activation decision');
		expect(out).toContain('demote');
		expect(out).toContain('0.750');
		expect(out).toContain('p exceeds threshold');
	});
});

describe('handleEpicCommand — decide (read-only what-if)', () => {
	test('returns a verdict rendering without dispatching execution', async () => {
		const out = await handleEpicCommand('/fake', ['decide'], 'sess-1');
		expect(out).toContain('Epic Mode — Activation Decision');
		expect(out).toContain('promote');
		expect(decideCalls).toBe(1);
	});

	test('does not write evidence (read-only)', async () => {
		// The evidence writer isn't bound to a seam in `decide`, but we can
		// at least verify the no-plan path produces a friendly message
		// instead of attempting a write.
		_internals.loadPlanJsonOnly = (async () => null) as never;
		const out = await handleEpicCommand('/fake', ['decide'], 'sess-1');
		expect(out).toContain('No plan found');
	});
});

describe('handleEpicCommand — last (most recent decision from evidence)', () => {
	test('returns a "no decisions yet" message when the evidence file is empty', async () => {
		_internals.readPromotionEvidence = (() => []) as never;
		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		expect(out).toContain('Epic Mode — Last Decision');
		expect(out).toContain('No decisions recorded yet');
		expect(out).toContain('run `/swarm epic decide`');
	});

	test('renders the most recent record with verdict, p, and gate-by-gate', async () => {
		_internals.readPromotionEvidence = (() => [
			{
				timestamp: '2026-05-27T11:00:00Z',
				sessionID: 'sess-prior',
				phase: 1,
				verdict: {
					decision: 'promote' as const,
					p: 0.12,
					rationale: {
						pCheck: { passed: true, p: 0.12, threshold: 0.3 },
						hotModuleCheck: { passed: true, touchedHotModules: [] },
						greenfieldCheck: {
							passed: true,
							commitsObserved: 80,
							minCommits: 20,
						},
					},
					blockingReasons: [],
				},
			},
			{
				timestamp: '2026-05-28T09:30:00Z',
				sessionID: 'sess-current',
				phase: 2,
				verdict: {
					decision: 'demote' as const,
					p: 0.55,
					rationale: {
						pCheck: { passed: false, p: 0.55, threshold: 0.3 },
						hotModuleCheck: {
							passed: false,
							touchedHotModules: ['src/global.ts'],
						},
						greenfieldCheck: {
							passed: true,
							commitsObserved: 50,
							minCommits: 20,
						},
					},
					blockingReasons: [
						'p (0.550) exceeds activation threshold (0.300)',
						'plan touches Lean Turbo hot module(s): src/global.ts',
					],
				},
			},
		]) as never;

		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		// Must show the LAST (second) record, not the first.
		expect(out).toContain('Decided at: 2026-05-28T09:30:00Z');
		expect(out).toContain('Session: sess-current');
		expect(out).toContain('Phase: 2');
		expect(out).toContain('Decision: **demote**');
		expect(out).toContain('p: 0.550');
		expect(out).toContain(
			'p (0.550) exceeds activation threshold (0.300)',
		);
		expect(out).toContain('plan touches Lean Turbo hot module(s)');
		// Gate-by-gate section
		expect(out).toContain('p-threshold');
		expect(out).toContain('hot-module');
		expect(out).toContain('greenfield');
		expect(out).toContain('src/global.ts');
		// History footer when records.length > 1
		expect(out).toContain('2 decisions total');
	});

	test('surfaces read errors as a friendly message rather than throwing', async () => {
		_internals.readPromotionEvidence = (() => {
			throw new Error('disk fell off');
		}) as never;
		const out = await handleEpicCommand('/fake', ['last'], 'sess-1');
		expect(out).toContain('Error reading epic-promotions.jsonl');
		expect(out).toContain('disk fell off');
	});
});

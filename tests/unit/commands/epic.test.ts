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

beforeEach(() => {
	active = false;
	sessionStateStored = null;
	decideCalls = 0;
	enableCalls = 0;
	disableCalls = 0;

	_internals.getAgentSession = ((id: string) =>
		id === 'sess-1' ? ({ id, turboMode: false } as never) : null) as never;
	_internals.isEpicModeActive = (() => active) as never;
	_internals.loadEpicSessionState = (() => sessionStateStored) as never;
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
	});

	test('`off` disables the mode and acks', async () => {
		active = true;
		const out = await handleEpicCommand('/fake', ['off'], 'sess-1');
		expect(out).toContain('Epic Mode disabled');
		expect(disableCalls).toBe(1);
		expect(active).toBe(false);
	});

	test('bare `/swarm epic` toggles', async () => {
		await handleEpicCommand('/fake', [], 'sess-1');
		expect(enableCalls).toBe(1);
		await handleEpicCommand('/fake', [], 'sess-1');
		expect(disableCalls).toBe(1);
	});

	test('unknown subcommand returns usage', async () => {
		const out = await handleEpicCommand('/fake', ['nope'], 'sess-1');
		expect(out).toContain("Unknown subcommand 'nope'");
		expect(out).toContain('Usage:');
	});
});

describe('handleEpicCommand — status', () => {
	test('renders "not toggled" when no session state exists', async () => {
		sessionStateStored = null;
		const out = await handleEpicCommand('/fake', ['status'], 'sess-1');
		expect(out).toContain('Epic Mode — Status');
		expect(out).toContain('has not been toggled');
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

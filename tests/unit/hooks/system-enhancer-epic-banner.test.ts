/**
 * Tests for Epic Mode banner constants + hasActiveEpicMode wiring.
 * File: tests/unit/hooks/system-enhancer-epic-banner.test.ts
 *
 * The full system-enhancer prompt-injection flow is heavy integration
 * machinery; this test covers the leaf-level invariants the
 * `if (hasActiveEpicMode(...)) inject(EPIC_MODE_BANNER)` block relies
 * on:
 *
 *   - `EPIC_MODE_BANNER` exists and instructs the architect to use
 *     `epic_run_phase` instead of `lean_turbo_run_phase`.
 *   - `hasActiveEpicMode(sessionID)` reads `session.epicModeActive`
 *     and returns the expected booleans (per-session and any-session).
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { EPIC_MODE_BANNER } from '../../../src/config/constants';
import {
	hasActiveEpicMode,
	resetSwarmState,
	startAgentSession,
	swarmState,
} from '../../../src/state';

beforeEach(() => {
	resetSwarmState();
});

afterEach(() => {
	resetSwarmState();
});

describe('EPIC_MODE_BANNER content', () => {
	test('instructs the architect to use epic_run_phase, not lean_turbo_run_phase', () => {
		expect(EPIC_MODE_BANNER).toContain('epic_run_phase');
		expect(EPIC_MODE_BANNER).toContain('lean_turbo_run_phase');
		// Post-live-test fix: the banner mandates the transparent
		// decide-then-dispatch path (epic_decide_phase + Task dispatch)
		// and forbids calling lean_turbo_run_phase directly.
		expect(EPIC_MODE_BANNER).toContain(
			'Do NOT call `lean_turbo_run_phase` directly',
		);
		expect(EPIC_MODE_BANNER).toContain('epic_decide_phase');
		expect(EPIC_MODE_BANNER).toContain('Task');
		expect(EPIC_MODE_BANNER).toContain('TRANSPARENT');
	});

	test('explains both promote and demote outcomes', () => {
		expect(EPIC_MODE_BANNER).toContain('promote');
		expect(EPIC_MODE_BANNER).toContain('demote');
	});

	test('preserves the Stage B / phase-reviewer requirement', () => {
		expect(EPIC_MODE_BANNER.toLowerCase()).toContain('phase reviewer');
	});

	test('mandates that the architect surface the verdict to the user', () => {
		// The visibility-fix from live testing: without this, weaker models
		// (Kimi K2.6 observed) ran epic_run_phase silently and the user had
		// no signal that Epic Mode was doing anything.
		expect(EPIC_MODE_BANNER).toContain('SURFACE the verdict');
		expect(EPIC_MODE_BANNER).toContain('Epic Mode: <DECISION>');
	});

	test('lists /swarm epic last as a visibility command', () => {
		expect(EPIC_MODE_BANNER).toContain('/swarm epic last');
	});

	test('mandates surfacing divergence to the user when a task wrote outside scope', () => {
		// Without this, per-task divergence is silent — the user only sees
		// the activation decision, not the scope-discipline signal that
		// drives the next threshold tightening.
		expect(EPIC_MODE_BANNER).toContain('SURFACE divergence');
		expect(EPIC_MODE_BANNER).toContain('summary.isClean: false');
		expect(EPIC_MODE_BANNER).toContain('Divergence: task');
	});

	test('lists /swarm epic calibration as a visibility command', () => {
		expect(EPIC_MODE_BANNER).toContain('/swarm epic calibration');
	});

	test('mandates declaring scope for every pending task BEFORE epic_run_phase (Step 0)', () => {
		// Discovered live (fair-clinical-bench session): without upfront
		// scope declaration, Lean Turbo's lane planner has no graph to
		// dispatch and returns empty lanes/serializedTasks even on a
		// promote verdict — the architect then falls back to serial
		// per-task delegation and Epic's parallelization is invisible.
		// Step 0 closes that gap.
		expect(EPIC_MODE_BANNER).toContain(
			'DECLARE SCOPE for every pending task',
		);
		expect(EPIC_MODE_BANNER).toContain('BEFORE calling `epic_run_phase`');
		expect(EPIC_MODE_BANNER).toContain('lane planner reads task scopes');
		// Must explicitly forbid the broken declare-as-you-go pattern.
		expect(EPIC_MODE_BANNER).toContain(
			'Do NOT declare scope task-by-task during execution',
		);
	});
});

describe('hasActiveEpicMode — per-session lookup', () => {
	test('returns false when no session exists', () => {
		expect(hasActiveEpicMode('non-existent')).toBe(false);
	});

	test('returns false for a session without epicModeActive set', () => {
		startAgentSession('sess-a', 'architect');
		expect(hasActiveEpicMode('sess-a')).toBe(false);
	});

	test('returns true when epicModeActive is explicitly set', () => {
		startAgentSession('sess-a', 'architect');
		const session = swarmState.agentSessions.get('sess-a');
		if (!session) throw new Error('session not found');
		session.epicModeActive = true;
		expect(hasActiveEpicMode('sess-a')).toBe(true);
	});

	test('returns false after the flag is cleared', () => {
		startAgentSession('sess-a', 'architect');
		const session = swarmState.agentSessions.get('sess-a');
		if (!session) throw new Error('session not found');
		session.epicModeActive = true;
		session.epicModeActive = false;
		expect(hasActiveEpicMode('sess-a')).toBe(false);
	});
});

describe('hasActiveEpicMode — global (any-session) lookup', () => {
	test('returns false when no sessions exist', () => {
		expect(hasActiveEpicMode()).toBe(false);
	});

	test('returns true if ANY session has it active', () => {
		startAgentSession('sess-a', 'architect');
		startAgentSession('sess-b', 'architect');
		const sb = swarmState.agentSessions.get('sess-b');
		if (!sb) throw new Error('session not found');
		sb.epicModeActive = true;
		expect(hasActiveEpicMode()).toBe(true);
	});

	test('returns false when no session has it active', () => {
		startAgentSession('sess-a', 'architect');
		startAgentSession('sess-b', 'architect');
		expect(hasActiveEpicMode()).toBe(false);
	});
});

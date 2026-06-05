/**
 * Tests for the tool-side MANDATORY-SURFACE block formatters.
 * File: tests/unit/tools/epic-surface-blocks.test.ts
 *
 * Background (2026-06-05, fair-clinical-bench Phase 3): the EPIC_MODE_BANNER
 * "MANDATORY SURFACE" wording reached the architect but weaker models
 * (Kimi K2.6) skipped emitting the verdict + wave-plan surfaces — they
 * went straight from tool call to the next tool call. The fix moves the
 * surface text into the tool RESULT: each tool now prepends a pre-formatted
 * block the architect only has to copy. These tests pin the rendered output
 * across the edge cases that matter:
 *
 *   epic_decide_phase surface (formatVerdictSurfaceBlock):
 *     - promote verdict with deps  - demote verdict
 *     - missing verdict / non-terminal reason → empty string (no surface)
 *
 *   epic_plan_waves surface (formatWavePlanSurfaceBlock):
 *     - multi-task wave 1 (parallel dispatch instruction)
 *     - single-task wave (must NOT be skipped)
 *     - serialized / degraded tasks rendered
 *     - failure result → empty string (no surface)
 *
 * The formatters are pure (verdict block does one best-effort plan read,
 * stubbed here via _internals) so they're unit-testable without a live
 * .swarm tree.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	_internals as runPhaseInternals,
	formatVerdictSurfaceBlock,
} from '../../../src/tools/epic-run-phase';
import type { EpicRunPhaseResult } from '../../../src/tools/epic-run-phase';
import { formatWavePlanSurfaceBlock } from '../../../src/tools/epic-plan-waves';
import type { EpicPlanWavesResult } from '../../../src/tools/epic-plan-waves';

// ─── formatVerdictSurfaceBlock (epic_decide_phase) ───────────────────────────

describe('formatVerdictSurfaceBlock', () => {
	const originalLoadPlan = runPhaseInternals.loadPlanJsonOnly;

	beforeEach(() => {
		// Stub plan read so the deps line is deterministic. Phase 3 with
		// 3.1/3.2 dep-free and 3.3 depending on 3.2.
		runPhaseInternals.loadPlanJsonOnly = (async () => ({
			phases: [
				{
					id: 3,
					name: 'Metrics',
					tasks: [
						{ id: '3.1', status: 'pending', depends: [] },
						{ id: '3.2', status: 'pending', depends: [] },
						{ id: '3.3', status: 'pending', depends: ['3.2'] },
					],
				},
			],
		})) as never;
	});

	afterEach(() => {
		runPhaseInternals.loadPlanJsonOnly = originalLoadPlan;
	});

	test('promote verdict renders both ▶ lines + plan_waves followup', async () => {
		const result: EpicRunPhaseResult = {
			success: true,
			reason: 'decided',
			verdict: {
				decision: 'promote',
				p: 0.123,
				rationale: {} as never,
				blockingReasons: [],
			},
		};
		const out = await formatVerdictSurfaceBlock(result, '/fake', 3);
		expect(out).toContain('STOP. MANDATORY USER-FACING SURFACE');
		expect(out).toContain('▶ Epic Mode: PROMOTE (p=0.123) — all activation gates cleared');
		// Only 3.3 has deps; 3.1/3.2 omitted.
		expect(out).toContain('▶ Dependencies: 3.3 ← 3.2');
		expect(out).not.toContain('3.1 ←');
		expect(out).toContain('call epic_plan_waves(directory, phase=3) next');
	});

	test('demote verdict renders blockingReason + serial followup', async () => {
		const result: EpicRunPhaseResult = {
			success: true,
			reason: 'demoted',
			verdict: {
				decision: 'demote',
				p: 0.812,
				rationale: {} as never,
				blockingReasons: ['hot module overlap: src/core/registry.ts'],
			},
		};
		const out = await formatVerdictSurfaceBlock(result, '/fake', 3);
		expect(out).toContain(
			'▶ Epic Mode: DEMOTE (p=0.812) — hot module overlap: src/core/registry.ts',
		);
		expect(out).toContain('fall back to per-task serial dispatch');
	});

	test('p is always formatted to exactly 3 decimals', async () => {
		const result: EpicRunPhaseResult = {
			success: true,
			reason: 'decided',
			verdict: {
				decision: 'promote',
				p: 0.5,
				rationale: {} as never,
				blockingReasons: [],
			},
		};
		const out = await formatVerdictSurfaceBlock(result, '/fake', 3);
		expect(out).toContain('(p=0.500)');
	});

	test('non-terminal reason (scopes-missing) renders NO surface', async () => {
		const result: EpicRunPhaseResult = {
			success: false,
			reason: 'scopes-missing',
			missingScopes: ['3.1'],
		};
		const out = await formatVerdictSurfaceBlock(result, '/fake', 3);
		expect(out).toBe('');
	});

	test('missing verdict renders NO surface', async () => {
		const result: EpicRunPhaseResult = {
			success: false,
			reason: 'no-plan',
		};
		const out = await formatVerdictSurfaceBlock(result, '/fake', 3);
		expect(out).toBe('');
	});

	test('unreadable plan still surfaces the verdict (deps line degrades)', async () => {
		runPhaseInternals.loadPlanJsonOnly = (async () => null) as never;
		const result: EpicRunPhaseResult = {
			success: true,
			reason: 'decided',
			verdict: {
				decision: 'promote',
				p: 0.1,
				rationale: {} as never,
				blockingReasons: [],
			},
		};
		const out = await formatVerdictSurfaceBlock(result, '/fake', 3);
		expect(out).toContain('▶ Epic Mode: PROMOTE');
		expect(out).toContain('plan unreadable');
	});
});

// ─── formatWavePlanSurfaceBlock (epic_plan_waves) ────────────────────────────

describe('formatWavePlanSurfaceBlock', () => {
	test('multi-task wave 1 → SEPARATE-Task-calls-in-ONE-message instruction', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [
				{ waveId: 1, taskIds: ['3.1', '3.2'], files: ['a.py', 'b.py'] },
				{ waveId: 2, taskIds: ['3.3'], files: ['c.py'] },
			],
			serializedTasks: [],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 3);
		expect(out).toContain('STOP. MANDATORY USER-FACING SURFACE — banner step 4b');
		expect(out).toContain('▶ Wave plan (phase 3, 2 waves):');
		expect(out).toContain('▶ - Wave 1: [3.1, 3.2] — a.py, b.py');
		expect(out).toContain('▶ - Wave 2: [3.3] — c.py');
		expect(out).toContain('▶ Serialized: [(none)]  Degraded: [(none)]');
		expect(out).toContain(
			'2 SEPARATE Task calls in ONE assistant message (one per id: 3.1, 3.2)',
		);
	});

	test('single-task wave 1 → ONE-Task instruction that forbids skipping', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [{ waveId: 1, taskIds: ['3.3'], files: ['c.py'] }],
			serializedTasks: [],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 3);
		expect(out).toContain('▶ Wave plan (phase 3, 1 wave):');
		expect(out).toContain('ONE Task call for 3.3 (single-task wave — do NOT skip)');
	});

	test('serialized + degraded tasks rendered in the surface', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [{ waveId: 1, taskIds: ['4.1'], files: ['x.py'] }],
			serializedTasks: ['4.2'],
			degradedTasks: [{ taskId: '4.3', reason: 'protected path' } as never],
		};
		const out = formatWavePlanSurfaceBlock(result, 4);
		expect(out).toContain('▶ Serialized: [4.2]  Degraded: [4.3]');
	});

	test('file list >3 is truncated with +N more', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [
				{
					waveId: 1,
					taskIds: ['1.1'],
					files: ['a.py', 'b.py', 'c.py', 'd.py', 'e.py'],
				},
			],
			serializedTasks: [],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 1);
		expect(out).toContain('a.py, b.py, c.py, +2 more');
	});

	test('wave with no files shows (no files) rather than empty', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [{ waveId: 1, taskIds: ['1.1'], files: [] }],
			serializedTasks: [],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 1);
		expect(out).toContain('▶ - Wave 1: [1.1] — (no files)');
	});

	test('empty waves but serialized tasks → serial-dispatch followup, still surfaces', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [],
			serializedTasks: ['2.1', '2.2'],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 2);
		expect(out).toContain('▶ Wave plan (phase 2, 0 waves):');
		expect(out).toContain('▶ Serialized: [2.1, 2.2]  Degraded: [(none)]');
		expect(out).toContain('dispatch serialized/degraded tasks one Task per assistant message');
	});

	test('failure result renders NO surface', () => {
		const result: EpicPlanWavesResult = {
			success: false,
			reason: 'scopes-missing',
			missingScopes: ['3.1'],
		};
		const out = formatWavePlanSurfaceBlock(result, 3);
		expect(out).toBe('');
	});
});

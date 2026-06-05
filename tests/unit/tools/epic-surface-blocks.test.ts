/**
 * Tests for the tool-side surface-block formatters.
 * File: tests/unit/tools/epic-surface-blocks.test.ts
 *
 * Background (2026-06-05): these blocks prepend a short, user-facing summary
 * to the `epic_decide_phase` / `epic_plan_waves` tool results so the
 * architect surfaces the verdict + wave plan to the user before dispatching.
 *
 * The FIRST iteration used a heavy "STOP. MANDATORY … COPY VERBATIM … Do NOT
 * call any tool" compliance block. It fixed silence but made the architect
 * robotic — it copied the verbatim lines and dropped all natural narration.
 * The SECOND iteration (this file's current expectations) hands the architect
 * the facts plus a plain "tell the user … in your own words" nudge, trusting
 * the model to paraphrase. These tests pin the lighter format and its edge
 * cases.
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

	test('promote verdict states decision + deps + a natural share nudge', async () => {
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
		// No more STOP/MANDATORY/VERBATIM compliance scaffolding.
		expect(out).not.toContain('STOP');
		expect(out).not.toContain('VERBATIM');
		expect(out).not.toContain('▶');
		expect(out).toContain(
			'Verdict for phase 3: PROMOTE (p=0.123 — all activation gates cleared)',
		);
		// Only 3.3 has deps; 3.1/3.2 omitted.
		expect(out).toContain('Dependencies: 3.3 ← 3.2');
		expect(out).not.toContain('3.1 ←');
		// Natural-narration nudge that enumerates ALL facts (so the model
		// can't drop dependencies, as it did live on 2026-06-05) + next step.
		expect(out).toContain('include ALL of these');
		expect(out).toContain('dependency chain above');
		expect(out).toContain('call epic_plan_waves(directory, phase=3)');
	});

	test('demote verdict states blockingReason + serial next step', async () => {
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
			'Verdict for phase 3: DEMOTE (p=0.812 — hot module overlap: src/core/registry.ts)',
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
		expect(out).toContain('(p=0.500');
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
		expect(out).toContain('Verdict for phase 3: PROMOTE');
		expect(out).toContain('plan unreadable');
	});
});

// ─── formatWavePlanSurfaceBlock (epic_plan_waves) ────────────────────────────

describe('formatWavePlanSurfaceBlock', () => {
	test('multi-task wave 1 → parallel-Task-calls guidance, no compliance block', () => {
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
		expect(out).not.toContain('STOP');
		expect(out).not.toContain('VERBATIM');
		expect(out).not.toContain('▶');
		expect(out).toContain('Wave plan for phase 3 — 2 waves:');
		expect(out).toContain('Wave 1: 3.1, 3.2  (a.py, b.py)');
		expect(out).toContain('Wave 2: 3.3  (c.py)');
		expect(out).toContain('Serialized: none. Degraded: none.');
		expect(out).toContain('Walk the user through this breakdown');
		expect(out).toContain(
			'dispatch wave 1 as 2 parallel Task calls (3.1, 3.2) in one message',
		);
	});

	test('single-task wave 1 → one-Task guidance', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [{ waveId: 1, taskIds: ['3.3'], files: ['c.py'] }],
			serializedTasks: [],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 3);
		expect(out).toContain('Wave plan for phase 3 — 1 wave:');
		expect(out).toContain('dispatch wave 1 as one Task call (3.3)');
	});

	test('serialized + degraded tasks rendered', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [{ waveId: 1, taskIds: ['4.1'], files: ['x.py'] }],
			serializedTasks: ['4.2'],
			degradedTasks: [{ taskId: '4.3', reason: 'protected path' } as never],
		};
		const out = formatWavePlanSurfaceBlock(result, 4);
		expect(out).toContain('Serialized: 4.2. Degraded: 4.3.');
	});

	test('file list >3 is truncated with +N more (basenames)', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [
				{
					waveId: 1,
					taskIds: ['1.1'],
					files: [
						'src/a.py',
						'src/b.py',
						'src/c.py',
						'src/d.py',
						'src/e.py',
					],
				},
			],
			serializedTasks: [],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 1);
		// Full paths are reduced to basenames for the user-facing summary.
		expect(out).toContain('a.py, b.py, c.py, +2 more');
		expect(out).not.toContain('src/a.py');
	});

	test('wave with no files shows "no files"', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [{ waveId: 1, taskIds: ['1.1'], files: [] }],
			serializedTasks: [],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 1);
		expect(out).toContain('Wave 1: 1.1  (no files)');
	});

	test('empty waves but serialized tasks → serial next step, still surfaces', () => {
		const result: EpicPlanWavesResult = {
			success: true,
			waves: [],
			serializedTasks: ['2.1', '2.2'],
			degradedTasks: [],
		};
		const out = formatWavePlanSurfaceBlock(result, 2);
		expect(out).toContain('Wave plan for phase 2 — 0 waves:');
		expect(out).toContain('Serialized: 2.1, 2.2. Degraded: none.');
		expect(out).toContain('dispatch the serialized/degraded tasks one at a time');
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

/**
 * Tests for Epic Mode activation decision.
 * File: tests/unit/turbo/epic/activation.test.ts
 *
 * Covers:
 *  - The three gates (p-threshold, hot-module, greenfield) each
 *    correctly block promotion when they fail.
 *  - All three pass → `promote`.
 *  - Default-serial property: any failing gate → `demote`.
 *  - Rationale shape includes evidence for each gate.
 *  - `blockingReasons` is human-readable and non-empty when demoted.
 */
import { describe, expect, test } from 'bun:test';
import type { CoChangeEntry } from '../../../../src/tools/co-change-analyzer';
import {
	decideEpicActivation,
	type EpicActivationOptions,
} from '../../../../src/turbo/epic/activation';
import type { CouplingTask } from '../../../../src/turbo/epic/coupling-report';

const DEFAULT_OPTS: EpicActivationOptions = {
	activationThreshold: 0.3,
	minCommitsForSignal: 20,
	cochangeNpmiThreshold: 0.6,
	cochangeMinCoChanges: 5,
};

function entry(fileA: string, fileB: string, npmi = 0.9): CoChangeEntry {
	const [a, b] = fileA < fileB ? [fileA, fileB] : [fileB, fileA];
	return {
		fileA: a,
		fileB: b,
		coChangeCount: 20,
		npmi,
		lift: 1,
		hasStaticEdge: false,
		totalCommits: 100,
		commitsA: 20,
		commitsB: 20,
	};
}

describe('decideEpicActivation — all gates pass', () => {
	test('promotes when p is low, no hot modules, history dense', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/bar.ts'] },
			{ id: '1.3', scope: ['src/baz.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.decision).toBe('promote');
		expect(v.p).toBe(0);
		expect(v.rationale.pCheck.passed).toBe(true);
		expect(v.rationale.hotModuleCheck.passed).toBe(true);
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
		expect(v.blockingReasons).toEqual([]);
	});
});

describe('decideEpicActivation — p-threshold gate', () => {
	test('demotes when p exceeds activation threshold', () => {
		// 5 tasks all touching the same file → C(5,2)=10 pairs, all conflict, p=1.
		const tasks: CouplingTask[] = Array.from({ length: 5 }, (_, i) => ({
			id: `1.${i + 1}`,
			scope: ['src/shared.ts'],
		}));
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.decision).toBe('demote');
		expect(v.p).toBe(1);
		expect(v.rationale.pCheck.passed).toBe(false);
		expect(v.blockingReasons[0]).toContain('p');
		expect(v.blockingReasons[0]).toContain('activation threshold');
	});

	test('exactly at threshold passes (>= comparison on demote side; <= on the gate)', () => {
		// 2 tasks, 1 conflict, p=1.0 — only passes if threshold >= 1.
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/a.ts'] },
			{ id: '1.2', scope: ['src/a.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 50, {
			...DEFAULT_OPTS,
			activationThreshold: 1.0,
		});
		expect(v.rationale.pCheck.passed).toBe(true);
		// hot-module passes too (no global/protected paths)
		expect(v.decision).toBe('promote');
	});
});

describe('decideEpicActivation — hot-module gate', () => {
	test('demotes when any task touches a Lean Turbo global file', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['package.json'] }, // global file
		];
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.decision).toBe('demote');
		expect(v.rationale.hotModuleCheck.passed).toBe(false);
		expect(v.rationale.hotModuleCheck.touchedHotModules).toContain(
			'package.json',
		);
		expect(v.blockingReasons.some((r) => r.includes('hot module'))).toBe(true);
	});

	test('demotes when any task touches a protected path (auth)', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/auth/login.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.decision).toBe('demote');
		expect(v.rationale.hotModuleCheck.passed).toBe(false);
	});

	test('does not flag false positives (e.g. authentication.ts is NOT auth)', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/authentication.ts'] }, // not protected
		];
		const v = decideEpicActivation(tasks, [], 50, DEFAULT_OPTS);
		expect(v.rationale.hotModuleCheck.passed).toBe(true);
	});
});

describe('decideEpicActivation — greenfield gate', () => {
	test('demotes when commits observed < minCommitsForSignal', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/bar.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 5, DEFAULT_OPTS);
		expect(v.decision).toBe('demote');
		expect(v.rationale.greenfieldCheck.passed).toBe(false);
		expect(v.blockingReasons.some((r) => r.includes('greenfield'))).toBe(true);
	});

	test('passes at the boundary (>= minCommitsForSignal)', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/foo.ts'] },
			{ id: '1.2', scope: ['src/bar.ts'] },
		];
		const v = decideEpicActivation(tasks, [], 20, DEFAULT_OPTS);
		expect(v.rationale.greenfieldCheck.passed).toBe(true);
	});

	test('zero observed commits explicitly fails', () => {
		const v = decideEpicActivation(
			[
				{ id: '1.1', scope: ['src/a.ts'] },
				{ id: '1.2', scope: ['src/b.ts'] },
			],
			[],
			0,
			DEFAULT_OPTS,
		);
		expect(v.rationale.greenfieldCheck.passed).toBe(false);
	});
});

describe('decideEpicActivation — multi-gate failures', () => {
	test('blockingReasons lists every failing gate', () => {
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/auth.ts'] },
			{ id: '1.2', scope: ['src/auth.ts'] }, // path conflict + protected
		];
		const v = decideEpicActivation(tasks, [], 0, DEFAULT_OPTS);
		expect(v.decision).toBe('demote');
		expect(v.blockingReasons.length).toBeGreaterThanOrEqual(2);
		// At least one mention of each failed gate
		const text = v.blockingReasons.join(' ');
		expect(text).toContain('hot module');
		expect(text).toContain('greenfield');
	});

	test('cochange-only conflict still drives p (even if path passes)', () => {
		// No path overlap, but cochange pair connects two tasks → conflict.
		// Two tasks → C(2,2)=1 pair → 1 conflict → p=1.0 → demote.
		const tasks: CouplingTask[] = [
			{ id: '1.1', scope: ['src/a.ts'] },
			{ id: '1.2', scope: ['src/b.ts'] },
		];
		const pairs = [entry('src/a.ts', 'src/b.ts', 0.9)];
		const v = decideEpicActivation(tasks, pairs, 50, DEFAULT_OPTS);
		expect(v.p).toBe(1);
		expect(v.decision).toBe('demote');
	});
});

describe('decideEpicActivation — edge cases', () => {
	test('empty tasks → p=0, all gates pass (degenerate promote)', () => {
		const v = decideEpicActivation([], [], 50, DEFAULT_OPTS);
		expect(v.p).toBe(0);
		expect(v.decision).toBe('promote');
		// Notably: no tasks means no hot modules to touch.
		expect(v.rationale.hotModuleCheck.passed).toBe(true);
	});

	test('rationale shape exposes p, threshold, hotModules, commits — for evidence', () => {
		const tasks: CouplingTask[] = [{ id: '1.1', scope: ['src/x.ts'] }];
		const v = decideEpicActivation(tasks, [], 30, DEFAULT_OPTS);
		expect(v.rationale.pCheck).toHaveProperty('p');
		expect(v.rationale.pCheck).toHaveProperty('threshold');
		expect(v.rationale.hotModuleCheck).toHaveProperty('touchedHotModules');
		expect(v.rationale.greenfieldCheck).toHaveProperty('commitsObserved');
		expect(v.rationale.greenfieldCheck).toHaveProperty('minCommits');
	});
});

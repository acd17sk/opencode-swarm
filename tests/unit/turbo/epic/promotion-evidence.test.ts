/**
 * Tests for the promotion-evidence JSONL writer.
 * File: tests/unit/turbo/epic/promotion-evidence.test.ts
 *
 * Covers:
 *  - Append creates .swarm/evidence/epic-promotions.jsonl on first call.
 *  - Multiple appends produce one JSON document per line, in order.
 *  - Read tolerates a malformed trailing line (partial-write resilience).
 *  - Returns null when the .swarm/evidence directory cannot be created.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
	appendPromotionEvidence,
	readPromotionEvidence,
} from '../../../../src/turbo/epic/promotion-evidence';

let dir: string;

beforeEach(() => {
	dir = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'epic-evidence-')),
	);
});

afterEach(() => {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
});

function fakeVerdict(decision: 'promote' | 'demote', p: number) {
	return {
		decision,
		p,
		rationale: {
			pCheck: { passed: decision === 'promote', p, threshold: 0.3 },
			hotModuleCheck: { passed: true, touchedHotModules: [] as string[] },
			greenfieldCheck: {
				passed: true,
				commitsObserved: 50,
				minCommits: 20,
			},
		},
		blockingReasons: decision === 'demote' ? ['simulated demotion'] : [],
	};
}

describe('appendPromotionEvidence', () => {
	test('creates the evidence directory and writes one line', () => {
		const result = appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:00:00Z',
			sessionID: 'sess-1',
			phase: 1,
			verdict: fakeVerdict('promote', 0.1),
		});
		expect(result).not.toBeNull();
		const filePath = path.join(
			dir,
			'.swarm',
			'evidence',
			'epic-promotions.jsonl',
		);
		expect(fs.existsSync(filePath)).toBe(true);
		const raw = fs.readFileSync(filePath, 'utf-8');
		expect(raw.split('\n').filter((l) => l.length > 0)).toHaveLength(1);
		const parsed = JSON.parse(raw.split('\n')[0]);
		expect(parsed.sessionID).toBe('sess-1');
		expect(parsed.phase).toBe(1);
		expect(parsed.verdict.decision).toBe('promote');
	});

	test('appends multiple records in order', () => {
		appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:00:00Z',
			sessionID: 'sess-1',
			phase: 1,
			verdict: fakeVerdict('promote', 0.1),
		});
		appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:01:00Z',
			sessionID: 'sess-1',
			phase: 2,
			verdict: fakeVerdict('demote', 0.5),
		});
		const records = readPromotionEvidence(dir);
		expect(records).toHaveLength(2);
		expect(records[0].verdict.decision).toBe('promote');
		expect(records[1].verdict.decision).toBe('demote');
	});

	test('written content is newline-terminated JSON', () => {
		appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:00:00Z',
			sessionID: 'sess-1',
			verdict: fakeVerdict('promote', 0.1),
		});
		const raw = fs.readFileSync(
			path.join(dir, '.swarm', 'evidence', 'epic-promotions.jsonl'),
			'utf-8',
		);
		expect(raw.endsWith('\n')).toBe(true);
	});
});

describe('readPromotionEvidence', () => {
	test('returns empty array when no file exists', () => {
		expect(readPromotionEvidence(dir)).toEqual([]);
	});

	test('skips malformed trailing line (partial-write tolerance)', () => {
		const filePath = path.join(
			dir,
			'.swarm',
			'evidence',
			'epic-promotions.jsonl',
		);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		// First a well-formed line, then a half-written one.
		const good = `${JSON.stringify({
			timestamp: 't',
			sessionID: 's',
			verdict: fakeVerdict('promote', 0.1),
		})}\n`;
		const bad = '{ this is broken';
		fs.writeFileSync(filePath, good + bad, 'utf-8');
		const records = readPromotionEvidence(dir);
		expect(records).toHaveLength(1);
		expect(records[0].sessionID).toBe('s');
	});
});

describe('appendPromotionEvidence — error path', () => {
	test('returns null when .swarm/evidence cannot be created (parent is a file)', () => {
		// Sabotage: create `.swarm` as a regular file so the recursive mkdir fails.
		fs.writeFileSync(path.join(dir, '.swarm'), 'not a directory', 'utf-8');
		const result = appendPromotionEvidence(dir, {
			timestamp: '2025-01-01T00:00:00Z',
			sessionID: 'sess-1',
			verdict: fakeVerdict('promote', 0.1),
		});
		expect(result).toBeNull();
	});
});

/**
 * Co-change pair source for Epic mode.
 *
 * Composes the existing `co_change_analyzer` primitives (`parseGitLog`,
 * `buildCoChangeMatrix`) to produce a full, unfiltered list of file-pair
 * co-change entries the Epic conflict module can threshold itself.
 *
 * Why not call `detectDarkMatter` directly?
 *  - `detectDarkMatter` caps output at the top 20 pairs by NPMI and excludes
 *    pairs that already have a static import edge. That filter is correct for
 *    *dark-matter discovery* (its purpose) but wrong for lane-conflict signal:
 *    a high-NPMI pair with a static edge is still a real coupling signal the
 *    lane planner should know about.
 *
 * Caching:
 *  - One entry per project directory, keyed on `git rev-parse HEAD`.
 *  - Same HEAD → cache hit, no git re-scan.
 *  - Different HEAD or different directory → recompute.
 *  - FIFO eviction at `MAX_TRACKED_DIRS` so multi-project usage stays bounded
 *    (AGENTS.md invariant 8: module-level state needs explicit eviction).
 *
 * Reuse vs reimplementation:
 *  - This module never copies analyzer logic. It only orchestrates calls to
 *    the analyzer's existing exported `_internals` (per AGENTS.md invariant
 *    on composition).
 *  - The git HEAD read is a separate bounded subprocess, exposed via the
 *    `_internals` DI seam so tests can stub it without `mock.module`.
 */

import * as child_process from 'node:child_process';
import { promisify } from 'node:util';
import {
	type CoChangeEntry,
	_internals as coChangeAnalyzer,
} from '../../tools/co-change-analyzer.js';

const execFileAsync = promisify(child_process.execFile);

/** Max directories tracked in the in-memory cache before FIFO eviction. */
const MAX_TRACKED_DIRS = 10;

/** Timeout for `git rev-parse HEAD`. Short — this should be near-instant. */
const GIT_HEAD_TIMEOUT_MS = 5_000;

/** Default commit window the analyzer scans, matching co_change_analyzer's own default. */
const DEFAULT_MAX_COMMITS = 500;

interface CacheEntry {
	head: string;
	entries: CoChangeEntry[];
	computedAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface GetCoChangePairsOptions {
	/** Maximum commits the analyzer scans. Defaults to 500. */
	maxCommitsToAnalyze?: number;
}

async function readGitHead(directory: string): Promise<string | null> {
	try {
		const { stdout } = await _internals.execFile('git', ['rev-parse', 'HEAD'], {
			cwd: directory,
			timeout: GIT_HEAD_TIMEOUT_MS,
		});
		const head = String(stdout).trim();
		return head.length > 0 ? head : null;
	} catch {
		return null;
	}
}

/**
 * Return the full co-change matrix for the given directory at the current
 * git HEAD. The returned entries are unfiltered: every pair the analyzer
 * recorded is present, with NPMI / lift / counts / static-edge fields. The
 * caller (Epic conflict module) applies the configured threshold.
 *
 * Returns `[]` when:
 *  - Directory is not a git repo, or `git` is unavailable / times out.
 *  - The analyzer's commit map is empty (greenfield repo).
 * Both cases are signal-absent, which the conflict module treats as
 * "fall back to path-only" per §15.6 of the design notes.
 */
export async function getCoChangePairs(
	directory: string,
	options?: GetCoChangePairsOptions,
): Promise<CoChangeEntry[]> {
	const head = await readGitHead(directory);
	if (head === null) {
		return [];
	}

	const cached = cache.get(directory);
	if (cached && cached.head === head) {
		return cached.entries;
	}

	const maxCommits = options?.maxCommitsToAnalyze ?? DEFAULT_MAX_COMMITS;
	const commitMap = await _internals.parseGitLog(directory, maxCommits);
	const matrix = _internals.buildCoChangeMatrix(commitMap);
	const entries = Array.from(matrix.values());

	if (!cache.has(directory) && cache.size >= MAX_TRACKED_DIRS) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== undefined) {
			cache.delete(oldestKey);
		}
	}

	cache.delete(directory);
	cache.set(directory, { head, entries, computedAt: Date.now() });

	return entries;
}

/** Test-only: drop all cache entries. */
export function _clearCache(): void {
	cache.clear();
}

/** Test-only: cache size, for asserting eviction behavior. */
export function _cacheSize(): number {
	return cache.size;
}

/**
 * Test-only DI seam. Mutating this object is file-scoped and trivially
 * restorable via afterEach, avoiding Bun's cross-file `mock.module` leak
 * (AGENTS.md invariant 7).
 */
export const _internals: {
	execFile: typeof execFileAsync;
	parseGitLog: typeof coChangeAnalyzer.parseGitLog;
	buildCoChangeMatrix: typeof coChangeAnalyzer.buildCoChangeMatrix;
} = {
	execFile: execFileAsync,
	parseGitLog: coChangeAnalyzer.parseGitLog,
	buildCoChangeMatrix: coChangeAnalyzer.buildCoChangeMatrix,
};

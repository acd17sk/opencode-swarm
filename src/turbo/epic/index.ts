/**
 * Epic mode — barrel export.
 *
 * Epic mode is a new, additive execution mode that composes Lean Turbo without
 * modifying it. Capability A (this module) adds co-change-aware conflict
 * detection on top of Lean Turbo's path-based primitives.
 *
 * Dependency direction is one-way: `epic` depends on `lean`; `lean` never
 * depends on `epic`. All Lean Turbo files stay byte-for-byte untouched.
 */

export type {
	CoChangeThreshold,
	EpicPairVerdict,
} from './cochange-conflict.js';
export { epicPairConflict } from './cochange-conflict.js';

export type { GetCoChangePairsOptions } from './cochange-source.js';
export { getCoChangePairs } from './cochange-source.js';

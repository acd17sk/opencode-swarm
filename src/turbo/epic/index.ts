/**
 * Epic mode — barrel export.
 *
 * Epic mode is a new, additive execution mode that composes Lean Turbo without
 * modifying it. Capabilities:
 *  - A: co-change-aware pair conflict (`epicPairConflict`).
 *  - B: coupling KPI + decoupling roadmap (`computeCouplingReport`).
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

export type {
	ComputeCouplingReportOptions,
	ConflictingPair,
	CouplingReport,
	CouplingTask,
	ModuleContention,
} from './coupling-report.js';
export {
	computeCouplingReport,
	formatCouplingReportMarkdown,
} from './coupling-report.js';

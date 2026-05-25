/**
 * Co-change-aware pair conflict predicate for Epic mode.
 *
 * Combines Lean Turbo's existing path-based conflict signal (imported from
 * `../lean/conflicts`) with a git co-change signal (from the
 * `co_change_analyzer` output, sourced via `./cochange-source`).
 *
 * Conservative combination rule (design notes §15.2 step 4):
 *  - The co-change signal may only ESCALATE a verdict, never DOWNGRADE it.
 *  - `conflict = pathConflict || cochangeConflict`.
 *  - This module never modifies Lean Turbo's behavior — when its caller does
 *    not invoke it, nothing changes anywhere.
 *
 * Path / co-change name reconciliation:
 *  - Scope paths may arrive normalized but absolute (`{projectRoot}/src/x.ts`)
 *    because `src/turbo/lean/planner.ts:getValidatedFiles` prepends `directory`
 *    to relative scopes.
 *  - Co-change paths come from `git log --name-only` and are always
 *    repo-relative (e.g. `src/x.ts`).
 *  - We bridge with a boundary-aware suffix match: a scope path matches a
 *    co-change path if they are equal OR the scope ends with `'/' + cochange`.
 *    This handles both absolute and relative scope paths without needing the
 *    project root.
 */
import type { CoChangeEntry } from '../../tools/co-change-analyzer.js';
/**
 * Threshold for treating a co-change pair as a conflict signal.
 *
 * `npmi` and `minCoChanges` directly correspond to fields on
 * `CoChangeEntry`. Both must be satisfied for a pair to contribute a signal.
 * Defaults live in `EpicConfigSchema` (`src/config/schema.ts`) and are
 * deliberately stricter than `co_change_analyzer`'s discovery defaults.
 */
export interface CoChangeThreshold {
    /** Minimum NPMI in [-1, 1]. */
    npmi: number;
    /** Minimum raw co-change count, to suppress small-sample noise. */
    minCoChanges: number;
}
/** Detailed verdict from `epicPairConflict`. */
export interface EpicPairVerdict {
    /** True iff the two scopes conflict under the combined signal. */
    conflict: boolean;
    /** Which signal(s) fired. `'none'` only when `conflict === false`. */
    reason: 'path' | 'cochange' | 'both' | 'none';
    /** Concrete pairs that drove the verdict. Empty arrays when no signal fired. */
    evidence: {
        /** Path-overlapping pairs (each entry: `[scopeApath, scopeBpath]`). */
        pathPairs: Array<[string, string]>;
        /** Co-change pairs (each entry references files as they appear in CoChangeEntry). */
        cochangePairs: Array<{
            a: string;
            b: string;
            npmi: number;
            coChangeCount: number;
        }>;
    };
}
/**
 * Decide whether two task scopes conflict, combining path-based and co-change
 * signals. Pure function — no I/O, no side effects.
 *
 * @param scopeA       Files task 1 declares. Paths may be absolute or relative.
 * @param scopeB       Files task 2 declares.
 * @param cochangePairs Unfiltered co-change entries from `./cochange-source`.
 *                     This function applies the threshold internally so callers
 *                     can pass the analyzer's output verbatim.
 * @param threshold    NPMI floor + min co-change count.
 *
 * Behavioral invariants verified by tests:
 *  - Empty `cochangePairs` (greenfield / signal absent) → verdict is exactly
 *    the path-only result. This is the "feature disabled" guarantee from
 *    design notes §15.6.
 *  - Co-change-only conflict promotes `'none'` to `'cochange'`.
 *  - Path-only conflict is unaffected by co-change input.
 *  - Both signals present → reason `'both'`.
 *  - Empty scopes (either side) → no conflict (no pairs to evaluate).
 */
export declare function epicPairConflict(scopeA: string[], scopeB: string[], cochangePairs: CoChangeEntry[], threshold: CoChangeThreshold): EpicPairVerdict;

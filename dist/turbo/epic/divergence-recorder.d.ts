/**
 * Divergence recorder for Epic Mode Capability D (self-calibration).
 *
 * After every task transitions to `completed`, this module:
 *   1. Compares the task's DECLARED scope (from
 *      `.swarm/scopes/scope-{taskId}.json` — what the coder said it would
 *      touch) against the ACTUAL files modified during the task
 *      (`session.modifiedFilesThisCoderTask` — what the guardrails hook
 *      observed the coder writing to).
 *   2. Computes divergence — undeclared writes (actual − declared), unused
 *      declarations (declared − actual), and a per-task divergence ratio
 *      (undeclared / max(1, actual)).
 *   3. Appends one record to `.swarm/epic/divergence.jsonl`.
 *
 * The calibration engine (`./calibration-engine.ts`) reads this history on
 * the next `epic_decide_phase` invocation and uses it to adjust the
 * activation threshold and hot-module list. This module just records.
 *
 * Pure I/O: never throws to the caller. Failures are logged and swallowed
 * so the task-completion path is never blocked by an audit write.
 */
/** One record per task completion. */
export interface DivergenceRecord {
    /** ISO 8601. */
    timestamp: string;
    sessionID: string;
    taskId: string;
    /** Phase the task belonged to, when known. */
    phaseNumber?: number;
    /** Normalised paths declared via `declare_scope` or files_touched fallback. */
    declaredScope: string[];
    /** Normalised paths the guardrails hook observed the coder write to. */
    actualFiles: string[];
    /** Files in `actualFiles` not present in `declaredScope`. */
    undeclared: string[];
    /** Files in `declaredScope` not present in `actualFiles`. */
    unused: string[];
    /** undeclared.length / max(1, actualFiles.length). 0 ⇒ fully declared. */
    divergenceRatio: number;
    /** True when divergenceRatio === 0 (no undeclared writes). */
    isClean: boolean;
}
/**
 * Compute the divergence between a declared scope and the files actually
 * modified. Pure — no I/O, no side effects. Returns the diff sets plus the
 * ratio used by the calibration engine.
 *
 * Path comparison uses `normalizePath` (POSIX-style, no trailing slash,
 * Windows-lowercased) from Lean Turbo's conflicts module so the comparison
 * is consistent with everything else in the lane planner.
 */
export declare function computeDivergence(declaredScope: readonly string[], actualFiles: readonly string[]): {
    declared: string[];
    actual: string[];
    undeclared: string[];
    unused: string[];
    divergenceRatio: number;
};
interface RecordTaskDivergenceArgs {
    directory: string;
    sessionID: string;
    taskId: string;
    phaseNumber?: number;
    declaredScope: readonly string[];
    actualFiles: readonly string[];
}
/**
 * Append one divergence record to the JSONL audit file.
 *
 * Append-only, line-delimited so partial writes are tolerable (the calibration
 * reader skips malformed lines). Best-effort — never throws to caller:
 *   - Directory-creation failure → log and return null.
 *   - Append write failure → log and return null.
 * Either keeps the task-completion path moving even if the audit subsystem
 * is broken (audit miss is not a correctness issue; blocking task completion
 * would be).
 */
export declare function recordTaskDivergence(args: RecordTaskDivergenceArgs): {
    path: string;
    record: DivergenceRecord;
} | null;
export interface ReadDivergenceHistoryOptions {
    /** Read at most this many of the most recent records. */
    limit?: number;
    /** Filter to this session (default: all sessions). */
    sessionID?: string;
    /**
     * Maximum bytes to read from the tail of the file. Defaults to
     * `MAX_TAIL_BYTES` (16 MiB) — large enough to hold thousands of
     * records, small enough to avoid OOMing on a runaway audit log.
     * Pass `Infinity` to disable the bound (callers that truly need the
     * whole history — adversarial review H3).
     */
    maxBytes?: number;
}
/**
 * Read divergence records from disk, oldest-to-newest within the read
 * window. Malformed lines (rare — could occur on partial write) are
 * silently skipped — they do not corrupt the well-formed records before or
 * after them. Returns `[]` when the file does not exist.
 *
 * Tail-bounded: by default reads at most the last `MAX_TAIL_BYTES`. When
 * the file is larger, the read starts mid-file and the FIRST encountered
 * line (which is almost certainly a partial record split by the byte
 * boundary) is discarded. This means very old records are not returned by
 * a default-bounded read — the calibration engine consumes the tail
 * incrementally via `processedRecords`, so it never needs the full history
 * in memory at once. For full-history audit reads (tests, ad-hoc tooling),
 * pass `maxBytes: Infinity`.
 */
export declare function readDivergenceHistory(directory: string, options?: ReadDivergenceHistoryOptions): DivergenceRecord[];
export {};

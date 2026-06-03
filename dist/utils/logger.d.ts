declare function isDebug(): boolean;
export declare function log(message: string, data?: unknown): void;
export declare function warn(message: string, data?: unknown): void;
/**
 * Phase 15 (B34): ALWAYS-EMITTED warning. Use this — not `warn()` — for
 * signals the operator MUST see during a live benchmark or production
 * run: Rule 2 commit failures, Phase 10 predecessor-evidence anomalies,
 * Phase 13 git-log-degraded states, Phase 14 lane-planning-blocked
 * correlations against `epic-promotions.jsonl`, phantom-dep typos.
 *
 * Rationale: `warn()` is gated behind `OPENCODE_SWARM_DEBUG=1`. Until
 * Phase 15 every diagnostic signal Phases 0-14 added was silenced
 * outside debug runs — including the audit-trail correlation log that
 * makes B22 wedges detectable. That defeats the whole point of those
 * signals.
 *
 * `criticalWarn` writes to stderr (so it survives stdout redirection
 * for grading scripts) with a `CRITICAL-WARN` tag distinct from
 * regular `WARN` so log scrapers can filter for must-act-on lines.
 */
export declare function criticalWarn(message: string, data?: unknown): void;
export declare function error(message: string, data?: unknown): void;
/**
 * DI seam for testability. Contains all test-mocked exports.
 * Internal calls should use _internals.fn() instead of fn() directly.
 */
export declare const _internals: {
    isDebug: typeof isDebug;
    log: typeof log;
    warn: typeof warn;
    criticalWarn: typeof criticalWarn;
    error: typeof error;
};
export {};

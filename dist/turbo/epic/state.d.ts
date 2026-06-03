/**
 * Durable Epic Mode session state (Capability C).
 *
 * Persists per-session Epic Mode activation state under
 * `<projectRoot>/.swarm/epic-state.json` so toggling survives process
 * restarts. Mirrors the pattern in `src/turbo/lean/state.ts` (atomic
 * `tmp + rename`, per-directory `stateUnreadableMap` for fail-closed
 * semantics, sessions-keyed shape) — without modifying that file.
 *
 * Dependency direction is one-way: this module imports nothing from
 * `src/turbo/lean/`. The shape is parallel but independent.
 */
/** Top-level state for a single session. */
export interface EpicSessionState {
    sessionID: string;
    /** When epic mode was last enabled for this session (ISO 8601). */
    enabledAt?: string;
    /** When epic mode was last disabled for this session (ISO 8601). */
    disabledAt?: string;
    /** Most recent activation decision recorded for this session, if any. */
    lastDecision?: EpicLastDecision;
    /** Whether epic mode is currently active for this session. */
    active: boolean;
}
/** Minimal snapshot of the last activation decision. */
export interface EpicLastDecision {
    decidedAt: string;
    phase?: number;
    decision: 'promote' | 'demote';
    p: number;
    blockingReasons: string[];
}
/** Persisted shape of `.swarm/epic-state.json`. */
export interface EpicPersistedState {
    version: 1;
    updatedAt: string;
    sessions: Record<string, EpicSessionState>;
}
export declare function emptyPersisted(): EpicPersistedState;
export declare function emptySessionState(sessionID: string): EpicSessionState;
export declare function isStateUnreadable(directory: string): boolean;
export declare function repairStateUnreadable(directory: string): void;
/** Read this session's state, or null if not yet recorded. */
export declare function loadEpicSessionState(directory: string, sessionID: string): EpicSessionState | null;
/** Write the given session state, replacing any prior entry for that sessionID. */
export declare function saveEpicSessionState(directory: string, state: EpicSessionState): void;
/** True iff epic mode is currently active for the given session. */
export declare function isEpicModeActive(directory: string, sessionID: string): boolean;
/**
 * True iff epic mode is currently active for ANY session in the project.
 *
 * Use this when a code path needs to know "is the project running under
 * Epic Mode right now" without caring which session toggled it. The
 * session-scoped `isEpicModeActive` answers "did THIS session toggle it" —
 * a different question with a different answer.
 *
 * The architect's session enables Epic via `/swarm epic on`; sub-agents
 * (coders, reviewers) dispatched through the `Task` tool run in their own
 * sessions and have no record of that toggle. Asking the project-scoped
 * check is the only correct way to honor Epic Mode from those flows.
 * Rule 2's auto-commit (centralized in Phase 5) is the canonical caller.
 *
 * Fail-closed: returns `false` on unreadable state, matching the rest of
 * this module's defaults.
 */
export declare function isEpicModeActiveForProject(directory: string): boolean;
/** Enable epic mode for the session; records `enabledAt`. */
export declare function enableEpicMode(directory: string, sessionID: string): void;
/** Disable epic mode for the session; records `disabledAt`. */
export declare function disableEpicMode(directory: string, sessionID: string): void;
/** Reset the session's state entry entirely. */
export declare function resetEpicSession(directory: string, sessionID: string): void;
/**
 * Update the session's `lastDecision` field. Used by the runner after each
 * activation evaluation so `/swarm epic status` can show the most recent
 * decision rationale without re-reading the evidence JSONL.
 *
 * Precondition: the session must already have an entry (i.e. the caller has
 * called `enableEpicMode` previously). This is intentional — recording a
 * decision for a never-toggled session would produce phantom state that
 * `/swarm epic status` could not distinguish from a legitimately-active
 * session. Callers that reach this function should have already verified
 * `isEpicModeActive(...)` returned `true`. Throws if no session entry exists.
 */
export declare function recordEpicDecision(directory: string, sessionID: string, decision: EpicLastDecision): void;

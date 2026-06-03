/**
 * Auto-commit on task completion — Rule 2 of the greenfield-smart redesign.
 *
 * When Epic Mode is active for the session and the project is a git repo,
 * `update_task_status` calls `commitTaskCompletion` after a task transitions
 * to `completed` and the durable plan write has succeeded. The resulting
 * commit serves two purposes:
 *
 *   1. **Greenfield gate progress.** Each completed-and-committed task
 *      advances `commitsObserved` so the activation gate
 *      (`src/turbo/epic/activation.ts`) eventually opens. Without this,
 *      an Epic-only workflow never produces commits and the gate
 *      permanently blocks parallel promotion — the exact failure mode
 *      Rule 4 of the redesign identified.
 *
 *   2. **Parallel-eligibility evidence (Rule 3).** Downstream tasks can
 *      require their `depends:` upstream to be *committed* (not just
 *      marked complete) before they fan out. The commit message format
 *      `swarm(task <id>): ...` is the searchable marker the lane
 *      planner consumes in `upstream-commits.ts`.
 *
 * Failure handling: every step degrades non-fatally. A failed commit must
 * never block the durable task-status update — the plan ledger is the
 * authoritative source (AGENTS.md #5), git is a downstream artifact.
 *
 * Subprocess discipline: delegates to `src/git/branch.ts`, which already
 * enforces AGENTS.md #3 (explicit cwd, bounded timeout, array-form spawn,
 * non-interactive). This module adds no new subprocess primitives.
 */
/** Result of a single task-commit attempt. */
export interface CommitTaskCompletionResult {
    /**
     * `true` when a `swarm(task <id>):` marker for this taskId is present
     * in git history at function exit — whether this call produced it
     * (`reason: 'success'`) or whether an earlier call did
     * (`reason: 'idempotent-skip'`).
     *
     * Phase 17 (B.M9): pre-Phase-17 the `'already-committed'` reason
     * returned `committed: false`, self-contradicting ("not committed
     * because already committed"). Architect LLMs interpreted the
     * `false` as a failure and retried, producing log noise. The fixed
     * semantic: `committed` answers "is the marker in git for this
     * taskId now?" — yes for both the fresh-write and the idempotent
     * skip paths.
     */
    committed: boolean;
    reason: 'no-git' | 'commit-failed' | 'success' | 'idempotent-skip';
    sha?: string;
    error?: string;
}
export declare function formatTaskCommitMessage(taskId: string, description?: string): string;
export declare function commitTaskCompletion(directory: string, taskId: string, description?: string, scopePaths?: string[]): Promise<CommitTaskCompletionResult>;
/**
 * DI seam — production code calls through `_internals.<name>` so tests
 * substitute deterministic doubles without `mock.module`'s cross-file
 * leak (AGENTS.md invariant 7). Restore in `afterEach`.
 */
export declare const _internals: {
    isGitRepo: (cwd: string) => boolean;
    /**
     * Stage exactly the declared scope paths for this task. The trailing
     * `:(exclude).swarm` + `:(exclude).swarm/**` pathspecs are belt-and-
     * suspenders against AGENTS.md #4 even when the architect's scope
     * declaration accidentally points into `.swarm/`. We do NOT rely on
     * the user's `.gitignore`: a single misconfigured project would
     * otherwise commit prompts, ledgers, telemetry, and evidence into
     * git history every time Rule 2 fires.
     *
     * Missing pathspecs (declared scope points to a non-existent file) are
     * left to surface as a `commit-failed` reason — better than silent
     * staging skip, since it tells the user their scope declaration is
     * stale. Rule 2's non-fatal contract means the plan-write still wins.
     */
    stageScopedPaths: (cwd: string, paths: string[]) => void;
    /**
     * `--allow-empty` variant of commit. We don't expose this in
     * `src/git/branch.ts` because it's specific to the task-completion
     * marker semantics — a normal commit should fail on empty trees to
     * surface bugs. Here we explicitly want the marker.
     *
     * Phase 8: `--no-verify` skips `pre-commit`, `commit-msg`, and
     * `pre-commit-msg` hooks. Rule 2's commits are protocol markers, not
     * user-authored content — running Biome/typecheck/lint on every task
     * completion would add minutes of wall-clock per task and, worse,
     * could block the marker entirely on a repo with a strict pre-commit
     * gate. Plan ledger remains authoritative; the commit is the audit
     * trail, not the gate.
     */
    commitAllowEmpty: (cwd: string, message: string) => void;
    gitHeadSha: (cwd: string) => string;
    /**
     * Returns true when a `swarm(task <id>):` marker subject for this
     * taskId already exists anywhere in git history. Used by the
     * idempotency guard above so repeat completion calls don't mint
     * duplicate markers.
     *
     * Implementation: `git log --grep=<pattern> -F` is NOT used (it
     * fixed-string-matches the whole subject); instead we anchor the
     * regex with `--extended-regexp` and bound the scan with `-n 1` so a
     * single match suffices. Returns false on any git failure — the
     * caller treats that as "unknown" and proceeds.
     */
    /**
     * Phase 11 (B5): async sleep used by `commitTaskCompletion`'s
     * retry loop. Routed through `_internals` so tests can substitute
     * a no-op stub and not actually wait during fast-path unit tests.
     */
    sleep: (ms: number) => Promise<void>;
    hasExistingTaskCommit: (cwd: string, taskId: string) => boolean;
};

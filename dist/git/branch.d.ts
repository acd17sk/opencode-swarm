/**
 * Execute git command safely.
 *
 * Non-interactive enforcement (AGENTS.md #3): three defenses ensure git
 * cannot block on a TTY prompt — GPG passphrase, credential helper,
 * "are you sure?" rebase confirmation, etc.
 *
 *  1. `stdio: ['ignore', ...]` closes the child's stdin. A prompt has
 *     no input source, so git/GPG/credential-helper sees EOF.
 *  2. `GIT_TERMINAL_PROMPT=0` tells git itself to refuse any prompt
 *     attempt outright rather than falling back to the controlling
 *     terminal (some prompts route through git, not the child).
 *  3. **Phase 11 (B1):** `-c commit.gpgsign=false -c tag.gpgsign=false`
 *     prepended to every command. Closes the SILENT-failure path where
 *     a developer/CI host has `commit.gpgsign=true` globally and no GPG
 *     agent — without (3), defenses (1)+(2) merely turn the prompt-
 *     hang into an immediate non-zero exit, which `commitTaskCompletion`
 *     catches as `commit-failed` non-fatally. Result: every Rule 2
 *     commit silently fails, predecessor-evidence (Phase 10) never
 *     accumulates, every phase demotes. (3) forces the underlying git
 *     subcommand to skip signing entirely. Tag-sign is included as
 *     belt-and-suspenders for future `git tag` callers.
 *
 *     This is the SINGLE source of truth for non-interactive git in this
 *     codebase. Adding it here covers `commitAllowEmpty` and every other
 *     caller (current and future) uniformly.
 *
 * Without these, hot-path callers like Rule 2's `commitTaskCompletion`
 * would hang for the full 30 s timeout on every task completion in any
 * environment with `commit.gpgsign = true` and no GPG agent.
 */
declare function gitExec(args: string[], cwd: string): string;
/**
 * Check if we're in a git repository
 */
export declare function isGitRepo(cwd: string): boolean;
/**
 * Get current branch name
 */
export declare function getCurrentBranch(cwd: string): string;
/**
 * Create a new branch
 * @param cwd - Working directory
 * @param branchName - Name of the branch to create
 * @param remote - Remote name (default: 'origin')
 */
export declare function createBranch(cwd: string, branchName: string, remote?: string): void;
/**
 * Get list of changed files compared to main/master
 * @param cwd - Working directory
 * @param branch - Base branch to compare against (optional, auto-detected if not provided)
 * @returns Array of changed file paths, or empty array if error occurs
 */
export declare function getChangedFiles(cwd: string, branch?: string): string[];
/**
 * Get default base branch (main or master)
 */
export declare function getDefaultBaseBranch(cwd: string): string;
/**
 * Stage specific files for commit
 * @param cwd - Working directory
 * @param files - Array of file paths to stage (must not be empty)
 * @throws Error if files array is empty
 */
export declare function stageFiles(cwd: string, files: string[]): void;
/**
 * Stage all files in the working directory
 * @param cwd - Working directory
 */
export declare function stageAll(cwd: string): void;
/**
 * Commit changes
 */
export declare function commitChanges(cwd: string, message: string): void;
/**
 * Get current commit SHA
 */
export declare function getCurrentSha(cwd: string): string;
/**
 * Check if there are uncommitted changes
 */
export declare function hasUncommittedChanges(cwd: string): boolean;
export interface ResetToRemoteBranchResult {
    success: boolean;
    targetBranch: string;
    localBranch: string;
    message: string;
    alreadyAligned: boolean;
    prunedBranches: string[];
    warnings: string[];
}
/**
 * Detect the default remote branch using multiple fallback methods
 */
declare function detectDefaultRemoteBranch(cwd: string): string | null;
/**
 * Reset local branch to align with its remote counterpart.
 * Safely handles uncommitted changes, unpushed commits, and detached HEAD states.
 *
 * @param cwd - Working directory
 * @param options - Options including pruneBranches flag
 * @returns Result object with success status and details
 */
export declare function resetToRemoteBranch(cwd: string, options?: {
    pruneBranches?: boolean;
}): ResetToRemoteBranchResult;
export interface ResetToMainAfterMergeResult {
    success: boolean;
    targetBranch: string;
    previousBranch: string;
    message: string;
    branchDeleted: boolean;
    changesDiscarded: boolean;
    warnings: string[];
}
/**
 * Aggressive git reset for post-merge cleanup.
 * Handles the common scenario: feature branch PR merged, local has uncommitted artifacts.
 * Steps: detect default branch → safety check → fetch → checkout → discard changes → reset → delete branch.
 * Safety guard: refuses if current branch has commits not on any remote tracking branch.
 */
export declare function resetToMainAfterMerge(cwd: string, options?: {
    pruneBranches?: boolean;
}): ResetToMainAfterMergeResult;
/**
 * DI seam for testability. Contains all test-mocked exports.
 * Internal calls should use _internals.fn() instead of fn() directly.
 */
export declare const _internals: {
    gitExec: typeof gitExec;
    detectDefaultRemoteBranch: typeof detectDefaultRemoteBranch;
    getDefaultBaseBranch: typeof getDefaultBaseBranch;
    resetToRemoteBranch: typeof resetToRemoteBranch;
    resetToMainAfterMerge: typeof resetToMainAfterMerge;
};
export {};

import type { ToolName } from '../tools/tool-names';
export declare const QA_AGENTS: readonly ["reviewer", "critic", "critic_oversight"];
export declare const PIPELINE_AGENTS: readonly ["explorer", "coder", "test_engineer"];
export declare const ORCHESTRATOR_NAME: "architect";
export declare const ALL_SUBAGENT_NAMES: readonly ["sme", "docs", "designer", "critic_sounding_board", "critic_drift_verifier", "critic_hallucination_verifier", "curator_init", "curator_phase", "council_generalist", "council_skeptic", "council_domain_expert", "skill_improver", "spec_writer", "reviewer", "critic", "critic_oversight", "explorer", "coder", "test_engineer"];
export declare const ALL_AGENT_NAMES: readonly ["architect", "sme", "docs", "designer", "critic_sounding_board", "critic_drift_verifier", "critic_hallucination_verifier", "curator_init", "curator_phase", "council_generalist", "council_skeptic", "council_domain_expert", "skill_improver", "spec_writer", "reviewer", "critic", "critic_oversight", "explorer", "coder", "test_engineer"];
export declare const OPENCODE_NATIVE_AGENTS: Set<"compaction" | "title" | "build" | "general" | "plan" | "explore" | "summary">;
export declare const CLAUDE_CODE_NATIVE_COMMANDS: ReadonlySet<string>;
export type QAAgentName = (typeof QA_AGENTS)[number];
export type PipelineAgentName = (typeof PIPELINE_AGENTS)[number];
export type AgentName = (typeof ALL_AGENT_NAMES)[number];
export declare const AGENT_TOOL_MAP: Record<AgentName, ToolName[]>;
export declare const MEMORY_TOOL_NAMES: readonly ["swarm_memory_recall", "swarm_memory_propose"];
export declare const MEMORY_AGENT_TOOL_MAP: Partial<Record<AgentName, ToolName[]>>;
/**
 * Human-readable descriptions for tools shown in the architect Available Tools block.
 * Used to generate the Available Tools section of the architect prompt at construction time.
 */
/**
 * Canonical set of tool names that write/modify file contents.
 * Used by scope-guard.ts and guardrails.ts to detect write operations.
 * NOTE: bash/shell tools are intentionally excluded — bash commands are opaque
 * to static scope analysis. Post-hoc detection via guardrails diff-scope provides secondary coverage.
 */
export declare const WRITE_TOOL_NAMES: readonly ["write", "edit", "patch", "apply_patch", "create_file", "insert", "replace", "append", "prepend"];
export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];
export declare const TOOL_DESCRIPTIONS: Partial<Record<ToolName, string>>;
export declare const DEFAULT_MODELS: Record<string, string>;
export declare const DEFAULT_AGENT_CONFIGS: Record<string, {
    model: string;
    fallback_models: string[];
}>;
export declare function isQAAgent(name: string): name is QAAgentName;
export declare function isSubagent(name: string): boolean;
import type { LeanTurboConfig, ScoringConfig } from './schema';
export declare const DEFAULT_SCORING_CONFIG: ScoringConfig;
/**
 * Resolve scoring configuration by deep-merging user config with defaults.
 * Missing scoring block → use defaults; partial weights → merge with defaults.
 *
 * @param userConfig - Optional user-provided scoring configuration
 * @returns The effective scoring configuration with all defaults applied
 */
export declare function resolveScoringConfig(userConfig?: ScoringConfig): ScoringConfig;
/**
 * Model ID substrings that identify low-capability models.
 * If a model's ID contains any of these substrings (case-insensitive),
 * it is considered a low-capability model.
 */
export declare const LOW_CAPABILITY_MODELS: readonly ["mini", "nano", "small", "free"];
/**
 * Returns true if the given modelId contains any LOW_CAPABILITY_MODELS substring
 * (case-insensitive comparison).
 *
 * @param modelId - The model ID to check
 * @returns true if the model is considered low capability, false otherwise
 */
export declare function isLowCapabilityModel(modelId: string): boolean;
export declare const SLOP_DETECTOR_DEFAULTS: {
    readonly enabled: true;
    readonly classThreshold: 3;
    readonly commentStripThreshold: 5;
    readonly diffLineThreshold: 200;
};
export declare const INCREMENTAL_VERIFY_DEFAULTS: {
    readonly enabled: true;
    readonly command: null;
    readonly timeoutMs: 30000;
    readonly triggerAgents: readonly ["coder"];
};
export declare const COMPACTION_DEFAULTS: {
    readonly enabled: true;
    readonly observationThreshold: 40;
    readonly reflectionThreshold: 60;
    readonly emergencyThreshold: 80;
    readonly preserveLastNTurns: 5;
};
export declare const TURBO_MODE_BANNER = "## \uD83D\uDE80 TURBO MODE ACTIVE\n\n**Speed optimization enabled for this session.**\n\nWhile Turbo Mode is active:\n- **Stage A gates** (lint, imports, pre_check_batch) are still REQUIRED for ALL tasks\n- **Tier 3 tasks** (security-sensitive files matching: architect*.ts, delegation*.ts, guardrails*.ts, adversarial*.ts, sanitiz*.ts, auth*, permission*, crypto*, secret*, security) still require FULL review (Stage B)\n- **Tier 0-2 tasks** can skip Stage B (reviewer, test_engineer) to speed up execution\n- **Phase completion gates** (completion-verify and drift verification gate) are automatically bypassed \u2014 phase_complete will succeed without drift verification evidence when turbo is active. Note: turbo bypass is session-scoped; one session's turbo does not affect other sessions.\n\nClassification still determines the pipeline:\n- TIER 0 (metadata): lint + diff only \u2014 no change\n- TIER 1 (docs): Stage A + reviewer \u2014 no change\n- TIER 2 (standard code): Stage A + reviewer + test_engineer \u2014 CAN SKIP Stage B with turboMode\n- TIER 3 (critical): Stage A + 2x reviewer + 2x test_engineer \u2014 Stage B REQUIRED (no turbo bypass)\n\nDo NOT skip Stage A gates. Do NOT skip Stage B for TIER 3.\n";
export declare const FULL_AUTO_BANNER = "## \u26A1 FULL-AUTO MODE ACTIVE\n\nYou are operating without a human in the loop. All escalations route to the Autonomous Oversight Critic instead of a user.\n\nBehavioral changes:\n- TIER 3 escalations go to the critic, not a human. Frame your questions technically, not conversationally.\n- Phase completion approval comes from the critic. Ensure all evidence is written before requesting.\n- The critic defaults to REJECT. Do not attempt to pressure, negotiate, or shortcut. Complete the evidence trail.\n- If the critic returns ESCALATE_TO_HUMAN, the session will pause or terminate. Only the critic can trigger this.\n- Do NOT ask \"Ready for Phase N+1?\" \u2014 call phase_complete directly. The critic reviews automatically.\n";
/**
 * Canonical default Lean Turbo configuration.
 *
 * This is the single source of truth for all 9 LeanTurboConfig fields.
 * Consumers MUST reference this constant instead of hardcoding their own
 * defaults — see v7.4.x config-drift fix (3 of 9 fields disagreed across
 * runner.ts, lean-turbo-plan-lanes.ts, lean-turbo-status.ts, and the
 * Zod schema in schema.ts).
 */
export declare const DEFAULT_LEAN_TURBO_CONFIG: LeanTurboConfig;
export declare const LEAN_TURBO_BANNER = "## \uD83D\uDEE4\uFE0F LEAN TURBO ACTIVE\n\nLane-based parallel execution is enabled for this phase.\n\nBehavioral changes:\n- Tasks are partitioned into parallel lanes based on file-scope conflicts. Tasks in the same lane run sequentially; tasks in different lanes run concurrently (up to max_parallel_coders).\n- **Lane dispatch overrides the one-agent-per-message rule**: for lean lane dispatch only, you may send multiple Task tool calls concurrently (one per lane).\n- **Lane tasks skip per-task Stage B** (reviewer + test_engineer). Quality is enforced at phase-end via phase reviewer and critic gates instead.\n- **Degraded tasks** (global files, protected paths, high-risk patterns) and **serialized tasks** (lock-conflicted) run through standard serial workflow with full Stage B gates.\n- **Phase reviewer and critic are REQUIRED** before phase_complete when lean turbo is active \u2014 they serve as the holistic quality gate for all lane work.\n- **Full-Auto composition**: if Full-Auto is also active, lane dispatch is subject to Full-Auto delegation policy and phase approval.\n- Use the lean_turbo_run_phase tool to execute a phase with parallel lanes\n\nDo NOT skip phase reviewer/critic when configured. Degraded and serialized tasks MUST still go through full Stage B.\n";
export declare const EPIC_MODE_BANNER = "## \uD83E\uDDED EPIC MODE ACTIVE\n\n**Epic Mode supersedes any Lean Turbo guidance you may have seen.** Do NOT call `lean_turbo_run_phase` directly while Epic Mode is on \u2014 Epic Mode is the autonomous coupling-aware layer that decides per plan whether Lean Turbo runs at all.\n\nBehavioral changes:\n- **When you need to execute a phase, call the `epic_run_phase(directory, phase, sessionID)` tool INSTEAD of `lean_turbo_run_phase(...)`.** The epic tool computes the plan-wide coupling coefficient `p` and gates on three checks (p-threshold, hot-module, greenfield), then either invokes Lean Turbo for parallel execution (when promoted) or returns a structured \"demoted\" verdict (when any gate fails).\n- **On a \"demoted\" verdict, fall back to the standard per-task serial flow** for that phase (delegate to coder, run Stage B per task, etc.). Do not attempt to invoke `lean_turbo_run_phase` after a demote \u2014 Epic Mode has already decided that this plan is too coupled to parallelize safely.\n- **On a \"promoted\" verdict, the tool already ran Lean Turbo** for that phase; the result includes `lanes`, `degradedTasks`, `serializedTasks` just like `lean_turbo_run_phase` would have produced. Phase reviewer + critic are still required at `phase_complete` per Lean Turbo's existing rules.\n- Each `epic_run_phase` invocation appends one record to `.swarm/evidence/epic-promotions.jsonl` with the verdict and rationale. `/swarm epic status` shows the most recent decision; `/swarm epic decide` previews the verdict without dispatching.\n- **After every `update_task_status(task_id, status=\"completed\")` call, also call `epic_record_divergence(directory, taskId, sessionID)`.** This feeds the calibration loop (Capability D) \u2014 it compares the task's declared scope against the files the coder actually wrote, and the next `epic_run_phase` uses the history to auto-tighten the activation threshold and grow the hot-module list. The call is best-effort and never blocks; missing it just costs one observation.\n\nDo NOT skip phase reviewer/critic. Epic Mode does not change Stage B requirements \u2014 it only chooses whether to parallelize.\n";

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
export declare const EPIC_MODE_BANNER = "## \uD83E\uDDED EPIC MODE ACTIVE\n\n**Epic Mode supersedes any Lean Turbo guidance you may have seen.** Do NOT call `lean_turbo_run_phase` directly while Epic Mode is on \u2014 Epic Mode is the autonomous coupling-aware layer that decides per plan whether Lean Turbo runs at all.\n\nMandatory behavioral changes:\n\n**0. DECLARE SCOPE for every pending task in the phase BEFORE calling `epic_run_phase`.**\nLean Turbo's lane planner reads task scopes (from `.swarm/scopes/scope-{taskId}.json` or from `files_touched` in `plan.json`) to compute parallel lanes. When scopes are empty, the planner has no graph to dispatch and returns empty lanes/serializedTasks \u2014 which means the promote verdict comes back with nothing actually parallelized. Before invoking `epic_run_phase(phase=N)`, call `declare_scope` once for every pending task in phase N, passing the exact file paths each task will touch (as listed in the architecture / plan). This is what unlocks Lean Turbo's lane planning. Do NOT declare scope task-by-task during execution \u2014 by then the planner has already run.\n\n**If `epic_run_phase` returns `reason: \"scopes-missing\"`**, the tool is telling you that one or more pending tasks lack scope data and it refused to dispatch. The response includes a `missingScopes` array of task ids. Resolution: call `declare_scope` for each missing task id with the correct file paths, then re-invoke `epic_run_phase`. Do not interpret this error as \"Epic Mode decided to serialize\" \u2014 Epic never even ran the decision; the preflight blocked it.\n\n**1. Call `epic_run_phase` BEFORE any phase work \u2014 not just full-phase batch execution.**\nAfter all pending-task scopes for the phase are declared (step 0), call `epic_run_phase(directory, phase=N, sessionID)` once for that phase. The tool computes the plan-wide coupling coefficient `p` and gates on three checks (p-threshold, hot-module, greenfield), then either invokes Lean Turbo for parallel execution (promote) or returns a structured \"demoted\" verdict (any gate failed). Do NOT call `lean_turbo_run_phase` directly while Epic Mode is on \u2014 Epic decides whether Lean Turbo runs at all.\n\n**2. SURFACE the verdict to the user BEFORE proceeding.**\nAfter every `epic_run_phase` call, IMMEDIATELY show the user a one-line summary:\n> Epic Mode: <DECISION> (p=<value>) \u2014 <one-sentence rationale or top blocking reason>\n\nThen continue per the verdict. The verdict is the user's only visibility into what Epic is doing \u2014 silence here makes the mode invisible. If the user is going to spend time per task you must tell them why up front.\n\n**3. On a \"demoted\" verdict, fall back to the standard per-task serial flow** for that phase (delegate to coder, run Stage B per task, etc.). Do not attempt to invoke `lean_turbo_run_phase` after a demote \u2014 Epic has already decided this plan is too coupled to parallelize safely.\n\n**4. On a \"promoted\" verdict, the tool already ran Lean Turbo** for that phase; the result includes `lanes`, `degradedTasks`, `serializedTasks` just like `lean_turbo_run_phase` would have produced. Phase reviewer + critic are still required at `phase_complete` per Lean Turbo's existing rules.\n\n**5. After every `update_task_status(task_id, status=\"completed\")` call, also call `epic_record_divergence(directory, taskId, sessionID)`.** This feeds the calibration loop (Capability D) \u2014 it compares the task's declared scope against the files the coder actually wrote, and the next `epic_run_phase` uses the history to auto-tighten the activation threshold and grow the hot-module list. The call is best-effort and never blocks; missing it just costs one observation.\n\n**6. SURFACE divergence to the user when a task wrote outside its declared scope.** If `epic_record_divergence` returns `summary.isClean: false`, IMMEDIATELY show the user a one-line summary:\n> Divergence: task `<taskId>` wrote `<undeclaredCount>` undeclared file(s) (ratio `<divergenceRatio>`)\n\nThis is the user's signal that scope discipline slipped on that task \u2014 and the reason the activation threshold may tighten on the next phase. Clean tasks (isClean: true) don't need a surface \u2014 they're the expected baseline.\n\nAudit & visibility (always-on pulls, no architect mediation):\n- Each `epic_run_phase` invocation appends one record to `.swarm/evidence/epic-promotions.jsonl` with the verdict and rationale.\n- `/swarm epic status` shows the session's most recent decision.\n- `/swarm epic last` shows the most recent decision from the durable evidence log.\n- `/swarm epic decide` previews the verdict without dispatching.\n- `/swarm epic calibration` shows the calibration state: learned threshold (vs. static), hot-module additions, consecutive-clean counter, and the recent divergent tasks that drove the threshold there.\n\nDo NOT skip phase reviewer/critic. Epic Mode does not change Stage B requirements \u2014 it only chooses whether to parallelize.\n";

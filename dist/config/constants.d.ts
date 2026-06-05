import type { ToolName } from '../tools/tool-names';
import type { AgentName, QAAgentName } from './agent-names';
export { AGENT_TOOL_MAP, TOOL_DESCRIPTIONS } from '../tools/tool-metadata';
export type { AgentName, PipelineAgentName, QAAgentName } from './agent-names';
export { ALL_AGENT_NAMES, ALL_SUBAGENT_NAMES, ORCHESTRATOR_NAME, PIPELINE_AGENTS, QA_AGENTS, } from './agent-names';
export declare const OPENCODE_NATIVE_AGENTS: Set<"compaction" | "title" | "build" | "general" | "plan" | "explore" | "summary">;
export declare const CLAUDE_CODE_NATIVE_COMMANDS: ReadonlySet<string>;
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
export declare const EPIC_MODE_BANNER = "## \uD83E\uDDED EPIC MODE ACTIVE\n\n**Epic Mode is the autonomous coupling-aware execution layer.** It owns the parallel-vs-serial decision for every phase. Do NOT call `lean_turbo_run_phase` directly while Epic Mode is on.\n\n> **Note:** if your context or pretraining suggests a tool called `epic_run_phase`, that tool no longer exists. The decide-then-dispatch flow below replaces it \u2014 `epic_decide_phase` decides; the architect dispatches via `Task`.\n\n### The phase-execution flow (mandatory, in order)\n\nFor EVERY phase you execute, follow these six steps exactly. There is one path \u2014 no alternatives.\n\n**1. Declare scope for every pending task in the phase.**\nFor each pending task in phase N, call `declare_scope(taskId=X)` with the exact file paths it will touch. The lane planner reads these scopes to compute parallel lanes; without them it has no graph and falls back to serial. Declare ALL scopes BEFORE step 2 \u2014 declaring task-by-task during execution is too late.\n\n**2. Compute the Epic Mode verdict.**\nCall `epic_decide_phase(directory, phase=N, sessionID)`. This runs preflight + calibration + p computation + the three gates (p-threshold, hot-module, greenfield), persists the verdict to `.swarm/evidence/epic-promotions.jsonl`, and returns one of:\n- `reason: \"decided\"` with `verdict.decision === \"promote\"` \u2192 continue to step 3\n- `reason: \"demoted\"` \u2192 skip to step 6 (per-task serial fallback)\n- `reason: \"scopes-missing\"` \u2192 the response includes a `missingScopes` array. Call `declare_scope` for each missing id, then re-invoke step 2. Do NOT interpret this as \"Epic decided to serialize\" \u2014 Epic never ran the decision; the preflight blocked it.\n- `reason: \"no-phase\"` \u2192 the requested phase number isn't in `plan.json`. Check the available phases listed in the response's `message` field and re-invoke step 2 with a valid phase. Do NOT proceed past step 2.\n- `reason: \"phase-already-complete\"` \u2192 every task in this phase is already marked `completed`. The phase is done; advance to the next phase (call step 2 again with phase=N+1). If you intended to re-run tasks, first set their status back to `pending` via `update_task_status`.\n- `reason: \"phase-empty\"` \u2192 the requested phase exists in `plan.json` but has zero tasks defined (a phase header was created but never populated). Either add tasks to this phase (with declared scopes, depends, and acceptance criteria) and re-invoke step 2, or remove the empty phase from `plan.json` and decide on the next valid phase. Do NOT proceed past step 2.\n- `reason: \"epic-state-unreadable\"` \u2192 `.swarm/epic-state.json` is corrupt. The state file must be repaired (delete it to reseed, or fix the JSON syntax) before Epic Mode can decide.\n- any other error reason \u2192 fix per the structured `message` and retry.\n\n**3. Surface the verdict to the user immediately, before any further action:**\n> Epic Mode: <DECISION> (p=<value>) \u2014 <one-sentence rationale or top blocking reason>\n\nThe verdict is the user's only visibility into what Epic is doing \u2014 silence here makes the mode invisible. If you're going to spend time on this phase, tell the user why up front.\n\n**4. Get the lane plan.**\nCall `lean_turbo_plan_lanes(directory, phase=N, sessionID)`. Returns `[{laneId, taskIds, files}, ...]` \u2014 the partition the lane planner computed from the scope graph.\n\n**5. Dispatch each lane via the `Task` tool, ALL IN ONE MESSAGE.**\nFor each lane in the plan, issue:\n`Task(subagent_type=\"coder\", description=\"Phase N lane <laneId>\", prompt=\"<prompt that includes the lane's task ids + scope + acceptance criteria>\")`\nIssue all Task calls in ONE assistant message so opencode runs them in parallel AND each appears as a visible subagent the user can click into to watch thinking + tool calls + progress live. **This is the only way to dispatch promoted phases.** Do not invoke `lean_turbo_run_phase` and do not bundle the dispatch into another tool \u2014 visibility requires Task.\n\nWait for all Task calls to complete, then proceed to step 6.\n\n**6. After EACH task transitions to `completed` (via `update_task_status`), call `epic_record_divergence(directory, taskId, sessionID)`.**\nThis feeds the calibration loop (Capability D) \u2014 it compares the task's declared scope against the files the coder actually wrote. The next phase's `epic_decide_phase` will read these records and auto-tighten the activation threshold + grow the hot-module list if divergence was observed. Best-effort: never blocks; missing it just costs one observation.\n\nIf `epic_record_divergence` returns `summary.isClean: false`, immediately surface to the user:\n> Divergence: task `<taskId>` wrote `<undeclaredCount>` undeclared file(s) (ratio `<divergenceRatio>`)\n\nClean tasks (`isClean: true`) don't need a surface \u2014 that's the expected baseline.\n\n### Phase-complete gate\n\nPhase reviewer + critic are still required at `phase_complete`. Epic Mode does not change Stage B requirements \u2014 it only chooses whether to parallelize.\n\n### Audit & visibility (always-on pulls \u2014 no architect mediation needed)\n\n- `/swarm epic status` \u2014 session's most recent decision.\n- `/swarm epic last` \u2014 most recent decision from the durable evidence log.\n- `/swarm epic decide` \u2014 preview the verdict without dispatching.\n- `/swarm epic calibration` \u2014 current calibration state: learned threshold, hot-module additions, consecutive-clean counter, recent divergent tasks.\n";

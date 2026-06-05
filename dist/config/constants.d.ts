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
export declare const EPIC_MODE_BANNER = "## \uD83E\uDDED EPIC MODE ACTIVE\n\n**\u26D4 THE USER ALWAYS COMES FIRST \u2014 this overrides everything below.** The user can message you at ANY time, including mid-phase while coders are running or retrying. The instant a user message arrives \u2014 a question, a slash command, a comment, anything \u2014 STOP advancing the flow. Do not dispatch, do not retry, do not call another tool. Read what they said and respond to them directly, in plain conversation, first. Never keep executing the protocol and leave a user message unanswered \u2014 ignoring the user is the single worst failure mode in this mode. After you've answered, pick up where you left off. If you're mid-wave when they interrupt, tell them the state (\"3.1 and 3.2 are still running; I'll continue once I've answered you\") rather than going silent.\n\n**Activation \u2260 start.** Until the user asks for execution (\"start phase N\", \"run task X\", \"continue\"): do nothing. On `/swarm turbo epic`, `/swarm epic *` and any slash status/config command: call the named tool ONCE, surface its output VERBATIM, then stop. Don't infer intent \u2014 if unsure, ASK. This restraint applies ONLY before activation.\n\n**Talk to the user as you work** \u2014 like you naturally would. Once they ask you to run a phase, keep them in the loop with a sentence before each step about what you're doing and why (\"Declaring scopes for 3.1\u20133.3 so the planner can find parallelism\u2026\", \"Discrimination and calibration are independent, so I'll run 3.1 and 3.2 in parallel\u2026\"). This is normal conversation, not a form to fill in \u2014 the steps below tell you the key facts to share, but say them in your own voice. Don't go silent and tool-only through a phase.\n\nUse `epic_plan_waves` (NOT `lean_turbo_plan_lanes` or the deprecated `epic_run_phase`) for the wave plan. Do NOT call `lean_turbo_run_phase` directly.\n\n### Six-step flow (only when the user asks to run a phase)\n\n> Supersedes Rule 1a/3a: declare ALL pending scopes UP FRONT (step 1), BEFORE step 2. Just-in-time declaration breaks the wave planner.\n\n**1. `declare_scope` for every pending task** \u2014 one call per single `taskId` string (NOT ranges/arrays/globs). Tight, disjoint scopes; avoid shared files (`__init__.py`, barrels, registries) \u2014 they force serial waves. Declared scope is a CONTRACT; if a task needs more files mid-run, re-declare BEFORE dispatching.\n\n**2. `epic_decide_phase(directory, phase=N, sessionID)`** \u2014 returns:\n- `decided`+`promote` \u2192 step 3\n- `demoted` \u2192 step 6 (per-task serial)\n- `scopes-missing` \u2192 `declare_scope` each `missingScopes[]`, retry step 2\n- `no-phase` | `phase-empty` | `phase-already-complete` | `epic-state-unreadable` \u2192 fix per response `message`, retry. `phase-already-complete` means call step 2 with `phase=N+1` (NOT step 4 directly).\n- other \u2192 fix per `message`, retry\n\n**3. Tell the user the verdict.** After `epic_decide_phase`, share the decision (promote/demote), the coupling score `p`, and the dependency chain \u2014 in your own words, a sentence or two \u2014 before moving on. The tool result hands you these facts ready to paraphrase. Don't dispatch silently; the user should understand why Epic chose parallel vs serial.\n\n**4. `epic_plan_waves(directory, phase=N)`** \u2014 returns `{ waves: [{ waveId, taskIds, files }], serializedTasks, degradedTasks, degradationSummary }`. Failure reasons mirror step 2; additionally: `git-failed` (retry), `planner-error` (check `errors[0]`).\n\n**4b. Tell the user the wave plan.** After `epic_plan_waves`, walk the user through the breakdown \u2014 which tasks run in which wave, what's parallel, anything serialized/degraded \u2014 before dispatching. The tool result hands you the wave list ready to paraphrase. If `waves.length` exceeds the distinct-dependency-layer count, also flag the over-split and its likely cause (typical: a shared file like a barrel/registry in multiple scopes forces serial waves), e.g. \"Wave N split into K single-task waves because every scope claims `<shared-file>` \u2014 re-declare those tasks without it to restore parallelism, then re-plan.\"\n\n`serializedTasks` causes (NOT `declare_scope`-fixable): cycle, `no-scope`, `invalid-scope`, cap-exhaustion. Fix dep graph or scope contents, re-plan.\n\n`degradedTasks[].reason` keys:\n- `global file conflict` / `protected path` \u2192 balanced mode, dispatch per-task after waves\n- `cross-batch upstream not committed (greenfield-smart Rule 3): <ids>` \u2192 commit named upstreams, re-plan\n- `unresolved in-batch dependency: <ids>` \u2192 fix upstream degrade/serialize, re-plan\n- `planning leftover (no identifiable blocker)` \u2192 surface as planner bug\n\n**5. Dispatch each wave: `wave.taskIds.length` SEPARATE `Task` calls in ONE assistant message.** Per wave in order:\n- One `Task(subagent_type=\"coder\", description=\"Phase N task <id>\", prompt=\"<scope + acceptance>\")` per `taskId`\n- ALL in same turn \u2192 concurrent\n- Wait for all in wave to reach `update_task_status(completed)` + `epic_record_divergence` before next wave\n\n\u26A0\uFE0F **Three defects:**\n1. **Bundling**: multiple ids in one Task call \u2192 kills 1:1 coder visibility\n2. **Splitting across messages**: serial execution, no parallelism\n3. **Skipping single-task waves**: still emit ONE Task, wait for completion+divergence\n\nThis is the only sanctioned dispatch path. Don't use `lean_turbo_run_phase`; don't bundle through other tools \u2014 visibility requires `Task`.\n\n`serializedTasks` + `degradedTasks` (after wave loop): ONE Task per assistant message each, never batched, wait for completion+divergence between.\n\n**6. After each `update_task_status(completed)`, call `epic_record_divergence(directory, taskId, sessionID)`** (feeds calibration). If `summary.isClean: false`:\n> Divergence: task `<id>` wrote <undeclaredCount> undeclared file(s) (ratio <ratio>)\n\n### Phase-complete + audit\n\nPhase reviewer + critic still required at `phase_complete` (Epic Mode doesn't change Stage B).\n\nAudit (no architect needed): `/swarm epic status | last | decide | calibration`.\n";

/**
 * `/swarm epic` — Epic Mode activation toggle and diagnostics (Capability C).
 *
 * Subcommands:
 *   /swarm epic on        — enable Epic Mode for this session
 *   /swarm epic off       — disable Epic Mode for this session
 *   /swarm epic           — toggle (on if off, off if on)
 *   /swarm epic status    — show current state + last decision rationale
 *   /swarm epic decide    — run the activation decision once and print the
 *                            verdict without dispatching execution
 *                            (read-only what-if; does NOT write to
 *                             `.swarm/evidence/epic-promotions.jsonl`)
 *
 * Toggling only mutates session state (and the durable
 * `.swarm/epic-state.json`); it does not start or stop any execution. The
 * `epic_run_phase` tool is the architect-facing entry that gates execution.
 */

import { loadPluginConfigWithMeta } from '../config/index.js';
import { loadPlanJsonOnly } from '../plan/manager.js';
import { getAgentSession } from '../state.js';
import {
	decideEpicActivation,
	type EpicActivationVerdict,
} from '../turbo/epic/activation.js';
import { getCoChangeData } from '../turbo/epic/cochange-source.js';
import type { CouplingTask } from '../turbo/epic/coupling-report.js';
import {
	disableEpicMode,
	enableEpicMode,
	isEpicModeActive,
	isStateUnreadable,
	loadEpicSessionState,
} from '../turbo/epic/state.js';
import { readTaskScopes } from '../turbo/lean/conflicts.js';

/**
 * Test-only DI seam. Production code calls `_internals.fn(...)` so tests can
 * replace these without `mock.module` (AGENTS.md invariant 7).
 */
export const _internals = {
	loadPluginConfigWithMeta,
	loadPlanJsonOnly,
	getCoChangeData,
	decideEpicActivation,
	getAgentSession,
	isEpicModeActive,
	isStateUnreadable,
	loadEpicSessionState,
	enableEpicMode,
	disableEpicMode,
	readTaskScopes,
};

export async function handleEpicCommand(
	directory: string,
	args: string[],
	sessionID: string,
): Promise<string> {
	if (!sessionID || sessionID.trim() === '') {
		return 'Error: No active session context. Epic Mode requires an active session. Use /swarm epic from within an OpenCode session.';
	}
	const session = _internals.getAgentSession(sessionID);
	if (!session) {
		return 'Error: No active session. Epic Mode requires an active session to operate.';
	}

	const arg0 = args[0]?.toLowerCase();

	switch (arg0) {
		case 'status':
			return renderStatus(directory, sessionID);
		case 'decide':
			return renderDecide(directory);
		case 'on':
			return enableAndAck(directory, sessionID, session);
		case 'off':
			return disableAndAck(directory, sessionID, session);
		case undefined:
			// No argument → status (NOT toggle). Toggle-by-default created
			// an infinite loop with weaker models (Kimi K2.6 observed):
			// when the architect called `swarm_command [command=epic]`
			// without args to "check state", the flag flipped; the next
			// call flipped it back; loop. Status is idempotent and matches
			// the user's intent on a bare `/swarm epic` — see what's on,
			// don't change anything. Explicit `on/off` are the mutators.
			return renderStatus(directory, sessionID);
		default:
			return `Unknown subcommand '${arg0}'.\n\nUsage:\n  /swarm epic on | off | status | decide\n  /swarm epic         (shows status)`;
	}
}

function enableAndAck(
	directory: string,
	sessionID: string,
	session: NonNullable<ReturnType<typeof _internals.getAgentSession>>,
): string {
	try {
		_internals.enableEpicMode(directory, sessionID);
	} catch (err) {
		return `Error enabling Epic Mode: ${err instanceof Error ? err.message : String(err)}`;
	}
	// Mirror the in-memory flag so `hasActiveEpicMode(sessionID)` picks up
	// the new state. This is what makes the system-enhancer auto-inject the
	// EPIC_MODE_BANNER on the next architect turn — without it, the durable
	// state would say "active" but the architect prompt would not know.
	session.epicModeActive = true;
	return [
		'Epic Mode enabled for this session.',
		'',
		'The architect will now use `epic_run_phase(phase)` instead of `lean_turbo_run_phase(phase)` for phase execution. Each call computes the plan-wide coupling coefficient `p` and chooses promote/demote per the configured thresholds.',
		'',
		'Run `/swarm epic decide` to see the current verdict without executing.',
	].join('\n');
}

function disableAndAck(
	directory: string,
	sessionID: string,
	session: NonNullable<ReturnType<typeof _internals.getAgentSession>>,
): string {
	try {
		_internals.disableEpicMode(directory, sessionID);
	} catch (err) {
		return `Error disabling Epic Mode: ${err instanceof Error ? err.message : String(err)}`;
	}
	session.epicModeActive = false;
	return 'Epic Mode disabled for this session.';
}

function renderStatus(directory: string, sessionID: string): string {
	const lines: string[] = ['## Epic Mode — Status', ''];
	// Distinguish "state is corrupt / fail-closed" from "never toggled" —
	// the underlying loader returns null for both, but the actionable advice
	// differs (the first one needs repair; the second one just needs `on`).
	if (_internals.isStateUnreadable(directory)) {
		lines.push(
			'**Epic Mode state is unreadable** (`.swarm/epic-state.json` is corrupt or has an unexpected shape). Status cannot be reported until the file is repaired or removed. The fail-closed marker means `epic_run_phase` will refuse to dispatch in this state.',
		);
		return lines.join('\n');
	}
	const state = _internals.loadEpicSessionState(directory, sessionID);
	if (!state) {
		lines.push('Epic Mode has not been toggled for this session.');
		return lines.join('\n');
	}
	lines.push(`Active: **${state.active ? 'yes' : 'no'}**`);
	if (state.enabledAt) lines.push(`Last enabled: ${state.enabledAt}`);
	if (state.disabledAt) lines.push(`Last disabled: ${state.disabledAt}`);
	if (state.lastDecision) {
		const ld = state.lastDecision;
		lines.push('');
		lines.push('### Last activation decision');
		lines.push(`- **Decision:** ${ld.decision}`);
		lines.push(`- **p:** ${ld.p.toFixed(3)}`);
		if (ld.phase !== undefined) lines.push(`- Phase: ${ld.phase}`);
		lines.push(`- Decided at: ${ld.decidedAt}`);
		if (ld.blockingReasons.length > 0) {
			lines.push('- Blocking reasons:');
			for (const r of ld.blockingReasons) lines.push(`  - ${r}`);
		}
	}
	return lines.join('\n');
}

async function renderDecide(directory: string): Promise<string> {
	const plan = await _internals.loadPlanJsonOnly(directory);
	if (!plan) {
		return 'No plan found at `.swarm/plan.json`. Run `/swarm plan` first.';
	}
	const { config } = _internals.loadPluginConfigWithMeta(directory);
	const modeCfg = config.turbo?.epic?.mode;
	const cochangeCfg = config.turbo?.epic?.cochange;
	const activationThreshold = modeCfg?.activation_threshold ?? 0.3;
	const minCommitsForSignal = modeCfg?.min_commits_for_signal ?? 20;
	const cochangeNpmiThreshold = cochangeCfg?.threshold ?? 0.6;
	const cochangeMinCoChanges = cochangeCfg?.min_co_changes ?? 5;

	const tasks: CouplingTask[] = [];
	for (const phase of plan.phases) {
		for (const task of phase.tasks) {
			const scopeFiles = _internals.readTaskScopes(directory, task.id);
			const scope: string[] = scopeFiles ?? task.files_touched ?? [];
			tasks.push({ id: task.id, scope });
		}
	}

	const { pairs, commitsObserved } =
		await _internals.getCoChangeData(directory);
	const verdict = _internals.decideEpicActivation(
		tasks,
		pairs,
		commitsObserved,
		{
			activationThreshold,
			minCommitsForSignal,
			cochangeNpmiThreshold,
			cochangeMinCoChanges,
		},
	);
	return formatVerdict(verdict);
}

function formatVerdict(verdict: EpicActivationVerdict): string {
	const lines: string[] = ['## Epic Mode — Activation Decision', ''];
	lines.push(`**Decision:** \`${verdict.decision}\``);
	lines.push(`**p:** ${verdict.p.toFixed(3)}`);
	lines.push('');
	lines.push('### Gates');
	lines.push(
		`- p-threshold: **${verdict.rationale.pCheck.passed ? 'pass' : 'fail'}** (p=${verdict.rationale.pCheck.p.toFixed(3)}, threshold=${verdict.rationale.pCheck.threshold.toFixed(3)})`,
	);
	lines.push(
		`- hot-module: **${verdict.rationale.hotModuleCheck.passed ? 'pass' : 'fail'}** (${verdict.rationale.hotModuleCheck.touchedHotModules.length} hot module(s) touched)`,
	);
	lines.push(
		`- greenfield: **${verdict.rationale.greenfieldCheck.passed ? 'pass' : 'fail'}** (${verdict.rationale.greenfieldCheck.commitsObserved} commits observed, ${verdict.rationale.greenfieldCheck.minCommits} required)`,
	);
	if (verdict.blockingReasons.length > 0) {
		lines.push('');
		lines.push('### Blocking reasons');
		for (const r of verdict.blockingReasons) lines.push(`- ${r}`);
	}
	lines.push('');
	lines.push(
		'_This was a read-only `/swarm epic decide` call — no execution was dispatched and no evidence file was written. Run via the `epic_run_phase` tool to actually act on the verdict._',
	);
	return lines.join('\n');
}

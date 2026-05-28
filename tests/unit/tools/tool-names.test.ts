import { describe, expect, test } from 'bun:test';
import {
	TOOL_NAME_SET,
	TOOL_NAMES,
	type ToolName,
} from '../../../src/tools/tool-names';

describe('tool-names', () => {
	test('TOOL_NAMES includes declare_scope', () => {
		expect(TOOL_NAMES).toContain('declare_scope');
	});

	test('TOOL_NAME_SET includes declare_scope', () => {
		expect(TOOL_NAME_SET.has('declare_scope')).toBe(true);
	});

	test('TOOL_NAMES has no duplicates', () => {
		expect(TOOL_NAMES.length).toBe(TOOL_NAME_SET.size);
	});

	test('declare_scope is a valid ToolName type', () => {
		const toolName: ToolName = 'declare_scope';
		expect(TOOL_NAME_SET.has(toolName)).toBe(true);
	});

	test('Epic Mode tools are present in TOOL_NAMES', () => {
		// Epic Mode (Capability C+D) exposes exactly two tools to the
		// architect: epic_decide_phase (transparent decide) and
		// epic_record_divergence (calibration capture). Both must be
		// registered.
		expect(TOOL_NAMES).toContain('epic_decide_phase');
		expect(TOOL_NAMES).toContain('epic_record_divergence');
	});

	test('epic_run_phase is INTENTIONALLY ABSENT from TOOL_NAMES (one-path enforcement)', () => {
		// Regression guard: db00eb8a removed epic_run_phase from the
		// architect's tool registry to enforce the transparent
		// decide-then-dispatch path. The function executeEpicRunPhase is
		// still exported from source for composition users, but no
		// ToolDefinition wraps it — the architect cannot invoke it. If a
		// future contributor re-adds it, this test fails loudly.
		expect(TOOL_NAMES).not.toContain('epic_run_phase' as ToolName);
		expect(TOOL_NAME_SET.has('epic_run_phase' as ToolName)).toBe(false);
	});
});

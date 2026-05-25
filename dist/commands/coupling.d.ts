/**
 * `/swarm coupling` — read-only coupling report (Epic mode, Capability B).
 *
 * Computes `p` for the current plan and surfaces the modules that contribute
 * most to detected coupling, with a ranked decoupling roadmap. Read-only:
 * changes no execution behavior; with the optional `--persist` flag, writes
 * a structured JSON report under `.swarm/epic/coupling-report.json` for
 * programmatic consumption.
 *
 * This command always runs independent of `turbo.epic.cochange.enabled`. The
 * config flag gates runtime planner integration (M3); `/swarm coupling` is a
 * diagnostic and what-if tool, so users can see the report before opting in.
 *
 * Flags:
 *   --phase <n>             Scope to one phase (default: whole plan).
 *   --threshold <number>    NPMI floor override (default: EpicConfigSchema 0.6).
 *   --min-co-changes <n>    Co-change-count floor override (default: 5).
 *   --format <fmt>          'markdown' (default) or 'json'.
 *   --persist               Also write JSON to .swarm/epic/coupling-report.json.
 */
import { loadPlanJsonOnly } from '../plan/manager.js';
import { getCoChangePairs } from '../turbo/epic/cochange-source.js';
/**
 * Entry point invoked from the command registry. Returns the report
 * formatted per the `--format` flag, plus a one-line "wrote to ..." trailer
 * when `--persist` is on.
 */
export declare function handleCouplingCommand(directory: string, args: string[]): Promise<string>;
/**
 * Test-only DI seam. Production code calls `_internals.fn(...)` so tests can
 * replace these without `mock.module` (AGENTS.md invariant 7).
 */
export declare const _internals: {
    loadPlanJsonOnly: typeof loadPlanJsonOnly;
    getCoChangePairs: typeof getCoChangePairs;
};

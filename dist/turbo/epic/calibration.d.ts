/**
 * Durable calibration state for Epic Mode Capability D.
 *
 * Persists the LEARNED knob overrides that `decideEpicActivation` consults
 * at runtime — the activation-threshold override (tighter than the static
 * config when divergence has been observed) and the auto-added hot-module
 * list (monotonically grows; never auto-shrinks per design).
 *
 * Lives at `<projectRoot>/.swarm/epic/calibration.json`. Pattern mirrors
 * `src/turbo/epic/state.ts` exactly — atomic `tmp + rename`, per-directory
 * fail-closed marker on malformed file, repair seam.
 *
 * No imports from `src/turbo/lean/` — purely additive to the Epic namespace.
 */
/** Persisted shape of `.swarm/epic/calibration.json`. */
export interface CalibrationState {
    version: 1;
    updatedAt: string;
    /**
     * Effective activation threshold override. When set, supersedes the
     * static `turbo.epic.mode.activation_threshold` config value (which is
     * always the absolute ceiling — calibration can tighten, never loosen
     * past, the static value). Range: same as the static config — [0, 1].
     */
    activationThresholdOverride?: number;
    /**
     * Modules promoted to the hot-module list by observed divergence.
     * Monotonically grows — never auto-shrinks (loosening the hot-module
     * list requires manual intervention; the calibration loop only adds).
     * Sorted lexicographically for stable diffs.
     */
    hotModuleAdditions: string[];
    /**
     * Running counter of consecutive clean (divergenceRatio === 0) task
     * outcomes since the last divergent task or the last loosening event.
     * Drives the loosen-rule (loosen only after `loosenWindow` consecutive
     * clean tasks). Cleared by the engine after any loosening or divergence.
     */
    consecutiveCleanCount: number;
    /** ISO 8601 timestamp of the most recent calibration-engine invocation. */
    lastCalibrationAt?: string;
    /** Number of divergence records processed by the engine so far. */
    processedRecords: number;
}
export declare function emptyCalibrationState(): CalibrationState;
export declare function isCalibrationStateUnreadable(directory: string): boolean;
export declare function repairCalibrationUnreadable(directory: string): void;
/**
 * Read calibration state from disk. Seeds an empty file on first access so
 * subsequent writes do not race on directory creation. Returns null when
 * the file is malformed (fail-closed via `stateUnreadableMap`).
 *
 * Self-healing: when the in-memory unreadable marker is set, this function
 * first attempts to re-validate the on-disk file. If a user (or another
 * process) has repaired the file out-of-band, the marker auto-clears and the
 * normal read proceeds. Without this, a long-lived plugin process would keep
 * returning null until manually told to repair (adversarial review H2).
 */
export declare function loadCalibrationState(directory: string): CalibrationState | null;
/**
 * Atomic write of calibration state. `tmp + rename` pattern with random
 * suffix to avoid concurrent-collision; tmp file is best-effort cleaned up
 * on rename failure so a failed write does not leave orphans.
 */
export declare function saveCalibrationState(directory: string, state: CalibrationState): void;

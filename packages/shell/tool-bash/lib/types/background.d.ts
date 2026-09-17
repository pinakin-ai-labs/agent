/**
 * Generic-task adaptation for background bash process handles.
 *
 * @module @deepseek-ai/dsh-tool-bash/background
 */
import type { ShellProcess } from '@deepseek-ai/dsh-shell';
import type { JobHooks } from '@deepseek-ai/dsh-jobs';
/**
 * Map a settled background process onto the generic task-outcome vocabulary:
 * `killed` stays `killed` (detail: the signal when one is known), everything
 * else is `completed` with the exit code as detail. A nonzero command exit is
 * reported, not failed, exactly like the foreground rendering.
 * @param proc - the settled process handle.
 * @returns the outcome for the `ctx.jobs` registration.
 */
export declare function processOutcome(proc: ShellProcess): {
    status: 'completed' | 'killed';
    detail: string;
};
/**
 * Adapt asynchronous shell preparation after job admission without exposing a partial process.
 * @param start - starts the process with job-owned cancellation.
 * @param renderOutput - consumes output from a published process.
 * @returns synchronous job hooks whose completion includes preparation and process settlement.
 */
export declare function processJob(start: (signal: AbortSignal) => Promise<ShellProcess>, renderOutput: (process: ShellProcess) => string): JobHooks;
//# sourceMappingURL=background.d.ts.map
import { type ChokidarOptions } from 'chokidar';
import type { Context } from '@deepseek-ai/cordis';
/**
 * Watch one patch path, including missing parents, and serialize refresh callbacks.
 * @param ctx Context that owns watcher disposal and receives refresh failures.
 * @param filename Absolute patch-file path.
 * @param options Deployment watcher options inherited from the HMR configuration.
 * @param refresh Callback for additions, changes, and removals.
 * @returns A disposer that closes the watcher and drains its current refresh.
 * @throws When path resolution, watcher startup, or effect registration fails.
 */
export declare function watchConfig(ctx: Context, filename: string, options: ChokidarOptions, refresh: () => Promise<void> | void): Promise<() => Promise<void>>;
//# sourceMappingURL=watch-config.d.ts.map
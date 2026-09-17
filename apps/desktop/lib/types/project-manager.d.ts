/** In-place owner of the reserved desktop profile and its private pnpm state. */
import type { DesktopPaths } from './paths.ts';
import type { DesktopRelease } from './release.ts';
/** Desktop plugin record derived from the installed profile. */
export interface DesktopPluginRecord {
    readonly name: string;
    readonly version: string;
    readonly enabled: boolean;
}
/** Exact executables the desktop shell bundles. */
export interface DesktopRuntimeExecutables {
    readonly node: string;
    readonly pnpm: string;
    readonly dsh: string;
    /** How the Host obtains release-owned packages outside the writable profile. */
    readonly profileResolution?: 'link' | 'runtime';
}
/** Hooks that stop the backend before profile writes and restart it after success. */
export interface DesktopProjectHooks {
    /** Stop the active backend and await process exit before modifying its files. */
    beforeChange(): Promise<void>;
    /** Start the modified profile after package preparation succeeds. */
    afterChange(): Promise<void>;
}
/** Supported dependency mutation. */
export type DesktopProjectMutation = {
    readonly type: 'plugin-add';
    readonly spec: string;
} | {
    readonly type: 'plugin-remove';
    readonly name: string;
} | {
    readonly type: 'plugin-update';
    readonly name: string;
    readonly version: string;
} | {
    readonly type: 'plugin-toggle';
    readonly name: string;
    readonly enabled: boolean;
} | {
    readonly type: 'plugins-disable-all';
};
/**
 * Validate one registry package spec and return its package name.
 * @param spec - npm registry name with an optional version or tag.
 * @returns Requested package name.
 */
export declare function packageNameFromSpec(spec: string): string;
/** Desktop npm project manager with direct writes and no rollback. */
export declare class DesktopProjectManager {
    readonly paths: DesktopPaths;
    readonly runtime: DesktopRuntimeExecutables;
    private lockDescriptor;
    private descriptor;
    /**
     * @param paths - Electron-owned package state and reserved desktop profile paths.
     * @param runtime - absolute bundled Node.js and pnpm entry paths.
     */
    constructor(paths: DesktopPaths, runtime: DesktopRuntimeExecutables);
    /** Read the active desktop plugin inventory. */
    listPlugins(): readonly DesktopPluginRecord[];
    /**
     * Reinitialize the profile, deleting configuration and third-party packages without a backup.
     * @param hooks - Stop the Host before resetting files; restart after preparation succeeds.
     * @returns Completion of reset; the held lock and shared product data are preserved.
     */
    resetConfiguration(hooks: DesktopProjectHooks): Promise<void>;
    /** Read the dsh version supplied by this application's verified resources. */
    dshVersion(): string;
    /** Read the release most recently applied to the active profile. */
    releaseVersion(): string;
    /** Reject a profile whose dependency links were prepared for another runtime. */
    assertProfileRuntime(projectDir: string): void;
    /** @returns Whether application resources support profile recovery. */
    canRecoverProfile(): boolean;
    private get pendingPackages();
    private currentRuntime;
    private readRuntime;
    private prepareProfile;
    /** Read release metadata and reconcile its external profile without installing core packages. */
    applyRelease(): Promise<boolean>;
    /** Modify the current profile while its backend is stopped; failures retain partial changes. */
    mutate(mutation: DesktopProjectMutation, hooks: DesktopProjectHooks): Promise<void>;
    private reconcileProfile;
    private finishPackageOperation;
    private applyMutation;
    private runPnpm;
    private writeLockOwner;
    private withLock;
}
/** Create build-only project metadata for materializing the signed runtime. */
export declare function createRuntimeProjectMetadata(projectDir: string, release: DesktopRelease): void;
/**
 * Create metadata for the unpackaged development project that links the current workspace.
 * @param projectDir - Disposable development profile directory.
 * @param release - Release identity shared by the linked CLI package and Electron shell.
 */
export declare function createDevelopmentProjectMetadata(projectDir: string, release: DesktopRelease): void;
/** Create the first external plugin profile without running a package manager. */
export declare function createPluginProfile(projectDir: string): void;
//# sourceMappingURL=project-manager.d.ts.map
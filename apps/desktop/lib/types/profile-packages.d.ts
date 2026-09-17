/** Desktop-owned host links and validation of the external plugin dependency graph. */
import { type DesktopRuntimeDescriptor } from './runtime-tree.ts';
/** Applied runtime identity and the only links Desktop may replace. */
export declare const DESKTOP_PROFILE_STATE = "desktop-runtime-state.json";
/** Durable ownership of a package-directory link. */
export interface DesktopPackageLink {
    readonly name: string;
    readonly target: string;
}
/** Runtime identity and managed links; package preparation may still be pending. */
export interface DesktopProfileState {
    readonly schemaVersion: 1;
    readonly runtimeId: string;
    readonly version: string;
    readonly nodeVersion: string;
    readonly platform: string;
    readonly arch: string;
    readonly lockHash: string;
    readonly links: readonly DesktopPackageLink[];
}
/**
 * Read profile state without interpreting an unpublished predecessor format.
 * @param profile - Desktop profile directory.
 * @returns Validated state, or undefined for an uninitialized profile.
 */
export declare function readDesktopProfileState(profile: string): DesktopProfileState | undefined;
/**
 * Hash the plugin lockfile, including the empty-profile case.
 * @param profile - Desktop profile directory.
 * @returns Lockfile content identity.
 */
export declare function desktopPluginLockHash(profile: string): string;
/**
 * Remove only recorded host links, without following even broken targets.
 * @param profile - Desktop profile.
 */
export declare function unlinkDesktopHostPackages(profile: string): void;
/**
 * Bind an external profile to this application's real package directories.
 * @param profile - Candidate profile.
 * @param root - Current immutable runtime directory.
 * @param runtime - Verified release descriptor.
 */
export declare function linkDesktopHostPackages(profile: string, root: string, runtime: DesktopRuntimeDescriptor): void;
/**
 * Record a runtime-resolved profile without changing links left by an earlier release.
 * @param profile - Active Desktop profile.
 * @param runtime - Verified release descriptor supplying the runtime generation.
 */
export declare function recordDesktopRuntimeProfile(profile: string, runtime: DesktopRuntimeDescriptor): void;
/**
 * Prove active plugin dependencies stay local and share the host's exact package instances.
 * @param profile - Profile with its generated host links present.
 * @param root - Immutable runtime directory.
 * @param runtime - Verified shared package inventory.
 * @param activePlugins - Explicit enabled plugin roots whose peer compatibility is required.
 * @param resolutionMode - Whether host packages are linked or supplied by a runtime generation.
 */
export declare function validateDesktopPluginGraph(profile: string, root: string, runtime: DesktopRuntimeDescriptor, activePlugins: readonly string[], resolutionMode?: 'link' | 'runtime'): void;
//# sourceMappingURL=profile-packages.d.ts.map
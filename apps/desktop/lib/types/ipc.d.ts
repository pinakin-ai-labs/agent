/** Typed preload operations exposed only by the Electron shell. */
import type { DesktopPluginRecord } from './project-manager.ts';
import type { DesktopLocale } from './locale.ts';
import type { DesktopBackendState } from './backend-controller.ts';
/** IPC channel names kept private to the desktop application bundle. */
export declare const DESKTOP_IPC: {
    readonly localeGet: "dsh-desktop:locale-get";
    readonly pluginsList: "dsh-desktop:plugins-list";
    readonly pluginsAdd: "dsh-desktop:plugins-add";
    readonly pluginsRemove: "dsh-desktop:plugins-remove";
    readonly pluginsUpdate: "dsh-desktop:plugins-update";
    readonly pluginsToggle: "dsh-desktop:plugins-toggle";
    readonly pluginsDisableAll: "dsh-desktop:plugins-disable-all";
    readonly backendStatus: "dsh-desktop:backend-status";
    readonly backendRetry: "dsh-desktop:backend-retry";
    readonly applicationRestart: "dsh-desktop:application-restart";
    readonly configurationReset: "dsh-desktop:configuration-reset";
    readonly backendState: "dsh-desktop:backend-state";
    readonly updatesCheck: "dsh-desktop:updates-check";
    readonly updatesInstall: "dsh-desktop:updates-install";
    readonly updatesState: "dsh-desktop:updates-state";
};
/** Desktop release update state rendered by desktop-owned UI. */
export interface DesktopUpdateState {
    readonly phase: 'idle' | 'checking' | 'available' | 'installing' | 'ready' | 'error';
    readonly version?: string;
    readonly message?: string;
}
/** Narrow bridge exposed through context isolation. */
export interface DshDesktopApi {
    readonly protocolVersion: 1;
    locale(): Promise<DesktopLocale>;
    readonly plugins: {
        list(): Promise<readonly DesktopPluginRecord[]>;
        add(spec: string): Promise<void>;
        remove(name: string): Promise<void>;
        update(name: string, version: string): Promise<void>;
        toggle(name: string, enabled: boolean): Promise<void>;
        disableAll(): Promise<void>;
    };
    readonly backend: {
        status(): Promise<DesktopBackendState>;
        retry(): Promise<void>;
        subscribe(listener: (state: DesktopBackendState) => void): () => void;
    };
    readonly updates: {
        check(): Promise<DesktopUpdateState>;
        install(): Promise<void>;
        subscribe(listener: (state: DesktopUpdateState) => void): () => void;
    };
}
/** Startup-page controls, unavailable to backend-provided application documents. */
export interface DshDesktopStartupApi extends Pick<DshDesktopApi, 'protocolVersion' | 'locale'> {
    readonly backend: Omit<DshDesktopApi['backend'], 'retry'>;
    disablePlugins(): Promise<void>;
    restart(): Promise<void>;
    resetConfiguration(): Promise<void>;
}
//# sourceMappingURL=ipc.d.ts.map
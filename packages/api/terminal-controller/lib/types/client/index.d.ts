/** Client terminal model service; views are keyed independently from Host terminal identities. */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { TerminalView, type TerminalRemote } from './model.ts';
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { TerminalShell, WebTerminalId, WebTerminalInfo } from '../types.ts';
export type { TerminalView, TerminalViewState, TerminalViewIssue, TerminalRenderFrame, TerminalRemote } from './model.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** React-free browser terminal views and explicit process cleanup. */
        webTerminals: ClientTerminals;
    }
}
/** Host-discovered shell menu with the browser's remembered available choice. */
export interface TerminalLaunchShells {
    readonly shells: readonly TerminalShell[];
    readonly selectedShell: string | undefined;
}
/** A failed background close that can be retried without restoring its tab. */
export interface TerminalCloseFailure {
    readonly id: WebTerminalId;
    readonly title: string;
    readonly message: string;
}
/** Session and occurrence lookup, independent tab and terminal identities and background cleanup. */
export declare class ClientTerminals extends Service {
    private readonly remote;
    /** Failed cleanup tasks; successful and in-progress closes have no visible notification. */
    readonly closeFailures: SnapshotStore<readonly TerminalCloseFailure[]>;
    private readonly requests;
    private readonly closing;
    private readonly closed;
    private disposed;
    private readonly views;
    /**
     * @param ctx - Client root Context with Gateway and terminal Remote namespace.
     * @param remote - generated terminal namespace.
     */
    constructor(ctx: Context, remote: TerminalRemote);
    /**
     * Return the stable model for one sidebar occurrence.
     * @param sessionId - owning Session.
     * @param key - sidebar occurrence key.
     * @param terminalId - existing Host identity when restoring a listed terminal.
     * @param shellPath - explicit shell for a new terminal; restored terminals retain their own shell.
     * @returns its observable state and terminal commands.
     */
    view(sessionId: SessionId, key: string, terminalId?: WebTerminalId, shellPath?: string): TerminalView;
    /**
     * Discover available launch choices on demand without allocating a PTY.
     * @param sessionId - target Session.
     * @param signal - the menu request lifetime.
     * @returns installed shells and the currently usable browser preference.
     */
    launchShells(sessionId: SessionId, signal: AbortSignal): Promise<TerminalLaunchShells>;
    /**
     * Remember the guide selection before allocating its terminal tab.
     * @param path - shell selected from Host discovery.
     */
    selectShell(path: string): void;
    /**
     * Save a close intent and release the tab immediately; cleanup outlives DOM unmount and reload.
     * @param sessionId - owning Session.
     * @param key - sidebar occurrence key, including an inactive restored tab.
     * @param terminalId - restored identity if the tab has no model yet.
     */
    close(sessionId: SessionId, key: string, terminalId?: WebTerminalId): void;
    /**
     * Query Host terminals that have neither a tab in this page nor an unfinished close.
     * @param sessionId - Session being displayed.
     * @returns terminals available for opening as recovered tabs.
     */
    recover(sessionId: SessionId): Promise<WebTerminalInfo[]>;
    /**
     * Retry a saved close request without reopening its tab.
     * @param id - failed terminal identity.
     */
    retryClose(id: WebTerminalId): void;
    private cleanup;
}
/** Required Client transport and terminal namespace. */
export declare const inject: string[];
/**
 * Install the Client terminal models.
 * @param ctx - Client root Context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map
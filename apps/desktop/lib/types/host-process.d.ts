/** Node-compatible child lifecycle and streaming custom-protocol carrier. */
import { DESKTOP_HOST_PROTOCOL_VERSION } from './host-protocol.ts';
/** Ready facts reported by one installed dsh child. */
export interface DesktopHostReady {
    readonly protocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION;
    readonly dshVersion: string;
}
/** One dsh backend running under an owned Node-compatible executable. */
export declare class DesktopHostProcess {
    private readonly executable;
    private readonly runtimeDir;
    private readonly projectDir;
    private readonly inspectPort?;
    private readonly environment;
    private readonly onFailure?;
    private child;
    private requestPipe;
    private responsePipe;
    private readonly responseDecoder;
    private requestWriteTail;
    private nextStreamId;
    private readonly pending;
    private readonly blockedResponses;
    private readyResolve;
    private readyReject;
    private readonly readyPromise;
    private exitPromise;
    private stderr;
    private failureReported;
    /**
     * @param executable - absolute upstream Node.js or Electron executable.
     * @param runtimeDir - immutable packages carried by the current application.
     * @param projectDir - active or staged desktop plugin profile.
     * @param inspectPort - optional loopback inspector port for workspace development.
     * @param environment - Child environment; runtime and package-manager overrides are removed.
     * @param onFailure - Receives the first fatal child or transport failure, including after readiness.
     */
    constructor(executable: string, runtimeDir: string, projectDir: string, inspectPort?: number | undefined, environment?: NodeJS.ProcessEnv, onFailure?: ((error: Error) => void) | undefined);
    /** Start the child once and resolve only after its complete composition is active. */
    start(): Promise<DesktopHostReady>;
    /** Forward one `dsh-app://app` request to the child without buffering its body. */
    fetch(request: Request): Promise<Response>;
    /** Request graceful teardown, then wait for child exit. */
    stop(): Promise<void>;
    private pumpRequest;
    private enqueueRequestFrame;
    private send;
    private acceptResponseBytes;
    private handleResponseFrame;
    private cancelResponse;
    private failPending;
    private finishPending;
    private resumeResponsePipe;
    private handleMessage;
    private fail;
}
//# sourceMappingURL=host-process.d.ts.map
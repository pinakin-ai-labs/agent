/** Stream scripts and the pushable, abort-aware stream a script drives. */
import type { StreamRecord } from './log.ts';
/** Test-side controls over one open stream. */
export interface StreamHandle {
    /** Queue one item for the consumer. */
    push(item: unknown): void;
    /** End the stream after the queued items drain. */
    end(): void;
    /** Fail the consumer's next read with `error` after the queued items drain. */
    fail(error: Error): void;
    /** Aborts when the opening signal aborts or the consumer returns early. */
    readonly signal: AbortSignal;
}
/**
 * How a stream endpoint answers an open: receives the open args and the
 * handle; the stream stays open after the script returns until `end()` or
 * `fail()`. A script that throws or rejects fails the stream with that error.
 */
export type StreamScript = (args: readonly unknown[], stream: StreamHandle) => void | Promise<void>;
/**
 * Script yielding `items`, then ending.
 * @param items - items in order.
 * @returns the script.
 */
export declare function frames(items: readonly unknown[]): StreamScript;
/**
 * Script yielding `initial`, then staying open for `streams.push`.
 * @param initial - items yielded on open.
 * @returns the script.
 */
export declare function openStream(initial?: readonly unknown[]): StreamScript;
/** One open stream: a queue the script pushes into and a single consumer reads from; the log entry tracks its state. */
export declare class MockStream implements StreamHandle, AsyncIterable<unknown> {
    readonly record: StreamRecord;
    private readonly sourceSignal;
    private readonly queue;
    private settled;
    private waiting;
    private drainWaiters;
    private readonly cancellation;
    readonly signal: AbortSignal;
    /** Consumer cancellation listener; attached while the stream is open, removed when it settles or cancels. */
    private readonly onAbort;
    /** Items pushed but not yet pulled by the consumer. */
    get queued(): number;
    /**
     * @param record - log entry this stream updates.
     * @param sourceSignal - cancellation from the caller that opened the stream.
     */
    constructor(record: StreamRecord, sourceSignal: AbortSignal);
    push(item: unknown): void;
    end(): void;
    fail(error: Error): void;
    /**
     * Start `script` on this stream.
     * @param script - the registered script.
     * @param args - open args.
     */
    run(script: StreamScript, args: readonly unknown[]): void;
    /**
     * Resolve once the consumer has pulled every queued item and waits for the next one, or the stream is no longer
     * open and holds nothing the consumer could still pull (a consumer that returns discards what it left).
     * @returns settles when drained.
     */
    drained(): Promise<void>;
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
    private next;
    private pull;
    private finish;
    private settle;
    private cancel;
    private isDrained;
    private wakeDrained;
}
/**
 * The `Error` a thrown value stands for: itself, or a new Error carrying its string form.
 * @param reason - thrown value.
 * @returns the error.
 */
export declare function toError(reason: unknown): Error;
//# sourceMappingURL=streams.d.ts.map
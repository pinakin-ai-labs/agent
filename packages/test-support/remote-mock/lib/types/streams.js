/** Stream scripts and the pushable, abort-aware stream a script drives. */
/**
 * Script yielding `items`, then ending.
 * @param items - items in order.
 * @returns the script.
 */
export function frames(items) {
    return (_args, stream) => {
        for (const item of items)
            stream.push(item);
        stream.end();
    };
}
/**
 * Script yielding `initial`, then staying open for `streams.push`.
 * @param initial - items yielded on open.
 * @returns the script.
 */
export function openStream(initial = []) {
    return (_args, stream) => {
        for (const item of initial)
            stream.push(item);
    };
}
/** One open stream: a queue the script pushes into and a single consumer reads from; the log entry tracks its state. */
export class MockStream {
    record;
    sourceSignal;
    queue = [];
    settled;
    waiting;
    drainWaiters = [];
    cancellation = new AbortController();
    signal = this.cancellation.signal;
    /** Consumer cancellation listener; attached while the stream is open, removed when it settles or cancels. */
    onAbort = () => { this.cancel(this.sourceSignal.reason); };
    /** Items pushed but not yet pulled by the consumer. */
    get queued() {
        return this.queue.length;
    }
    /**
     * @param record - log entry this stream updates.
     * @param sourceSignal - cancellation from the caller that opened the stream.
     */
    constructor(record, sourceSignal) {
        this.record = record;
        this.sourceSignal = sourceSignal;
        if (sourceSignal.aborted)
            this.cancel(sourceSignal.reason);
        else
            sourceSignal.addEventListener('abort', this.onAbort, { once: true });
    }
    push(item) {
        if (this.record.state !== 'open')
            return;
        this.record.pushed += 1;
        if (this.waiting !== undefined) {
            const { resolve } = this.waiting;
            this.waiting = undefined;
            resolve({ value: item, done: false });
            return;
        }
        this.queue.push(item);
    }
    end() {
        this.settle({ kind: 'end' }, 'ended');
    }
    fail(error) {
        this.settle({ kind: 'fail', error }, 'failed');
    }
    /**
     * Start `script` on this stream.
     * @param script - the registered script.
     * @param args - open args.
     */
    run(script, args) {
        let outcome;
        try {
            outcome = script(args, this);
        }
        catch (error) {
            this.fail(toError(error));
            return;
        }
        if (outcome instanceof Promise)
            void outcome.catch((error) => { this.fail(toError(error)); });
    }
    /**
     * Resolve once the consumer has pulled every queued item and waits for the next one, or the stream is no longer
     * open and holds nothing the consumer could still pull (a consumer that returns discards what it left).
     * @returns settles when drained.
     */
    drained() {
        if (this.isDrained())
            return Promise.resolve();
        return new Promise((resolve) => { this.drainWaiters.push(resolve); });
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => this.next(),
            return: () => {
                this.cancel();
                return Promise.resolve({ value: undefined, done: true });
            },
        };
    }
    next() {
        const result = this.pull();
        this.wakeDrained();
        return result;
    }
    pull() {
        if (this.queue.length > 0)
            return Promise.resolve({ value: this.queue.shift(), done: false });
        if (this.settled !== undefined)
            return this.finish(this.settled);
        if (this.record.state === 'cancelled')
            return Promise.resolve({ value: undefined, done: true });
        if (this.waiting !== undefined)
            return Promise.reject(new Error(`remote-mock: ${this.record.endpoint} stream has one consumer`));
        return new Promise((resolve, reject) => { this.waiting = { resolve, reject }; });
    }
    finish(settled) {
        return settled.kind === 'end' ? Promise.resolve({ value: undefined, done: true }) : Promise.reject(settled.error);
    }
    settle(settled, state) {
        if (this.record.state !== 'open')
            return;
        this.record.state = state;
        this.settled = settled;
        this.sourceSignal.removeEventListener('abort', this.onAbort);
        this.wakeDrained();
        // A pending read exists only while the queue is empty: push() resolves it directly instead of queueing.
        const waiting = this.waiting;
        if (waiting === undefined)
            return;
        this.waiting = undefined;
        void this.finish(settled).then(waiting.resolve, waiting.reject);
    }
    cancel(reason) {
        if (this.record.state === 'open') {
            this.record.state = 'cancelled';
            this.sourceSignal.removeEventListener('abort', this.onAbort);
            const waiting = this.waiting;
            this.waiting = undefined;
            this.queue.length = 0;
            this.cancellation.abort(reason);
            waiting?.resolve({ value: undefined, done: true });
        }
        // Whether cancelled or left after the producer settled, the consumer pulls nothing more: drop what it left.
        this.queue.length = 0;
        this.wakeDrained();
    }
    isDrained() {
        return this.queue.length === 0 && (this.waiting !== undefined || this.record.state !== 'open');
    }
    wakeDrained() {
        if (!this.isDrained())
            return;
        const waiters = this.drainWaiters;
        this.drainWaiters = [];
        for (const resolve of waiters)
            resolve();
    }
}
/**
 * The `Error` a thrown value stands for: itself, or a new Error carrying its string form.
 * @param reason - thrown value.
 * @returns the error.
 */
export function toError(reason) {
    return reason instanceof Error ? reason : new Error(String(reason));
}
//# sourceMappingURL=streams.js.map
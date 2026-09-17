/** Direct Messages transport with one cancellable lifecycle per model request. */
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, ImageAttachmentAccessResolver, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { DeepSeekAdapterOptions, DeepSeekConnectionOptions as Connection } from '../../common/types.ts';
import type { DeepSeekFileStore } from '../../common/file-store.ts';
/** Request-local dependencies supplied by the owning Cordis plugin. */
export interface AdapterDependencies {
    /** Resolve a single validated configuration generation. */
    connection(): Connection;
    /** Resolve the key named by that same generation. */
    apiKey(connection: Connection): Promise<string>;
    /** Stable anonymous Harness identity. */
    userId(): string;
    /** Current attachment service; absence is valid for text requests. */
    attachments(): AttachmentStore | undefined;
    /** Current execution-world attachment path. */
    imageAccess: ImageAttachmentAccessResolver;
    /** Process-wide Files upload reuse and recovery. */
    files(): DeepSeekFileStore;
    /** Prepare plugin-contributed fields for this exact HTTP request. */
    prepareExtensions: DeepSeekAdapterOptions['prepareExtensions'];
    /** Report discarded replay metadata without exposing durable content or signatures. */
    onReplayDegrade?: (detail: {
        provider: string;
        model: string;
        reason: string;
    }) => void;
}
/** DeepSeek provider using Messages content and native thinking replay. */
export declare class DeepSeekMessagesAdapter extends LlmAdapter {
    private readonly dependencies;
    constructor(dependencies: AdapterDependencies);
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    providerRetryPolicy(_provider: string): import("@deepseek-ai/dsh-llm").ResolvedRetryPolicy;
    listModels(provider: string): Promise<import("@deepseek-ai/dsh-llm").LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<import("@deepseek-ai/dsh-llm").LlmResolvedModelInfo>;
    imageRequestPricing(_provider: string, model: string): import("@deepseek-ai/dsh-llm").LlmImageRequestPricing;
    prepareCall(provider: string, model: string): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private generate;
    private request;
}
//# sourceMappingURL=adapter.d.ts.map
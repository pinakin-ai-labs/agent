import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { DeepSeekAdapterOptions } from './common/types.ts';
/** One provider route with protocol-local transport and shared credentials and model configuration. */
export declare class DeepSeekAdapter extends LlmAdapter {
    private readonly dependencies;
    private readonly files;
    constructor(dependencies: DeepSeekAdapterOptions);
    private implementation;
    providerInfo(provider: string): import("@deepseek-ai/dsh-llm").LlmProviderInfo;
    providerRetryPolicy(provider: string): import("@deepseek-ai/dsh-llm").ResolvedRetryPolicy | undefined;
    listModels(provider: string): Promise<readonly import("@deepseek-ai/dsh-llm").LlmModelInfo[]>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<import("@deepseek-ai/dsh-llm").LlmResolvedModelInfo>;
    imageRequestPricing(provider: string, model: string): import("@deepseek-ai/dsh-llm").LlmImageRequestPricing | undefined;
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
//# sourceMappingURL=adapter.d.ts.map
/** Deterministic Messages image preparation for Files references and bounded inline fallback. */
import type { AttachmentStore, ImageAttachmentRef, RequestImageAttachment } from '@deepseek-ai/dsh-attachment';
import type { ImageAttachmentAccessResolver, Message } from '@deepseek-ai/dsh-llm';
import type { DeepSeekConnectionOptions as Connection } from '../../common/types.ts';
import type { DeepSeekFileId } from '../../common/file-id.ts';
import type { RequestFiles } from '../../common/request-files.ts';
export { deepSeekImageRequestPricing as imagePricing } from '../../common/request-pricing.ts';
/** Normalize retained image references before converting Messages content.
 * @param history - durable history; never mutated.
 * @param connection - request-local image budgets.
 * @param modelId - target model id.
 * @param attachments - mounted attachment store, required only for image requests.
 * @param access - current execution-world path resolver.
 * @param signal - request cancellation.
 * @returns projected history and prepared image bytes keyed by attachment id.
 */
export declare function prepareImages(history: readonly Message[], connection: Connection, modelId: string, attachments: AttachmentStore | undefined, access: ImageAttachmentAccessResolver, signal: AbortSignal): Promise<{
    messages: readonly Message[];
    versions: Map<ImageAttachmentRef['attachmentId'], RequestImageAttachment>;
}>;
/** Require logged offload before retrying images that exceed the inline budget.
 * @param messages - history already within the Files budget.
 * @param versions - normalized versions prepared for retained references.
 * @param connection - resolved inline bounds.
 * @returns unchanged history within both byte and image-count limits.
 */
export declare function inlineImages(messages: readonly Message[], versions: ReadonlyMap<ImageAttachmentRef['attachmentId'], RequestImageAttachment>, connection: Connection): readonly Message[];
/** Resolve retained images to Files ids, recording every occurrence for failure diagnostics.
 * @param messages - history within the Files byte/count budget.
 * @param versions - normalized versions for every retained reference.
 * @param files - request-owned Files resolution and recovery.
 * @returns ids keyed by durable attachment identity.
 */
export declare function prepareFileIds(messages: readonly Message[], versions: ReadonlyMap<ImageAttachmentRef['attachmentId'], RequestImageAttachment>, files: RequestFiles): Promise<Map<ImageAttachmentRef['attachmentId'], DeepSeekFileId>>;
//# sourceMappingURL=images.d.ts.map
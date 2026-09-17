/** DeepSeek Files API transport for Chat Completions and Messages endpoints. @module dsh-llm-deepseek/files-api */
import { LlmError } from '@deepseek-ai/dsh-llm';
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment';
import type { DeepSeekFileId as DeepSeekFileIdType } from './file-id.ts';
import type { DeepSeekProtocol } from './types.ts';
/** Required opt-in for Messages file operations and file-referenced image requests. */
export declare const MESSAGES_FILES_BETA = "files-api-2025-04-14";
/** Minimum provider-supported file lifetime. */
export declare const MIN_FILE_EXPIRY_SECONDS = 3600;
/** Maximum provider-supported file lifetime. */
export declare const MAX_FILE_EXPIRY_SECONDS = 2592000;
/** Maximum Files API upload size. */
export declare const MAX_FILE_UPLOAD_BYTES: number;
/** Current per-key file-count quota. */
export declare const MAX_STORED_FILE_COUNT = 10000;
/** Current per-key storage quota. */
export declare const MAX_STORED_FILE_BYTES: number;
/** Validated file metadata normalized from either DeepSeek Files protocol. */
export interface DeepSeekFileObject {
    id: DeepSeekFileIdType;
    bytes: number;
    createdAt: number;
    filename: string;
    /** Chat Completions purpose; synthesized as `user_data` for Messages. */
    purpose: 'user_data';
    /** Remote Chat Completions expiry or the upload-time Messages reuse deadline; Messages list/retrieve omit this field. */
    expiresAt?: number;
}
/** One page returned by `GET /files`. */
export interface DeepSeekFilePage {
    data: DeepSeekFileObject[];
    firstId?: DeepSeekFileIdType;
    lastId?: DeepSeekFileIdType;
    hasMore: boolean;
}
/** Files API operation failure with its HTTP status retained for recovery policy. */
export declare class DeepSeekFilesError extends LlmError {
    /** Parsed provider detail used only for error classification. */
    readonly detail: string;
    /**
     * @param message - user-readable provider failure.
     * @param status - HTTP status returned by the Files API.
     * @param detail - provider error fields joined for classification.
     */
    constructor(message: string, status: number, detail: string);
}
/**
 * Whether an upload failure reports a provider storage or file-count quota.
 * @param error - Files API operation failure.
 * @returns whether one bounded remote cleanup and upload retry may recover.
 */
export declare function isFilesQuotaError(error: unknown): error is DeepSeekFilesError;
interface FilesApiOptions {
    baseURL: string;
    apiKey: string;
    protocol: DeepSeekProtocol;
    fetch?: typeof fetch;
}
/** Direct Files client retaining the configured URL root and refusing redirects before credentials can leave its origin. */
export declare class DeepSeekFilesClient {
    private readonly baseURL;
    private readonly apiKey;
    private readonly fetchImpl;
    private readonly protocol;
    private readonly path;
    /**
     * @param options - endpoint, API-key snapshot, and optional test transport.
     */
    constructor(options: FilesApiOptions);
    private parseFile;
    private request;
    /**
     * Upload one image with an explicit expiry.
     * @param input - deterministic request-version bytes, media type, filename, lifetime, and cancellation.
     * @returns the validated file and reuse deadline. Messages omits expiry metadata;
     *   its deadline uses upload creation plus the requested lifetime.
     */
    upload(input: {
        data: Uint8Array;
        mediaType: ImageMediaType;
        filename: string;
        expiresAfterSeconds: number;
        signal?: AbortSignal;
    }): Promise<DeepSeekFileObject & {
        expiresAt: number;
    }>;
    /**
     * List one page of files. Ordering applies only to Chat Completions; Messages owns its page order.
     * @param options - pagination, ordering, and cancellation.
     * @returns the validated page with null Messages cursors omitted.
     */
    list(options?: {
        after?: DeepSeekFileIdType;
        limit?: number;
        order?: 'asc' | 'desc';
        signal?: AbortSignal;
    }): Promise<DeepSeekFilePage>;
    /**
     * Retrieve one file object.
     * @param fileId - provider file identifier.
     * @param signal - request cancellation.
     * @returns the validated file object.
     */
    retrieve(fileId: DeepSeekFileIdType, signal?: AbortSignal): Promise<DeepSeekFileObject>;
    /**
     * Delete one provider file.
     * @param fileId - provider file identifier.
     * @param signal - request cancellation.
     */
    delete(fileId: DeepSeekFileIdType, signal?: AbortSignal): Promise<void>;
}
export {};
//# sourceMappingURL=files-api.d.ts.map
/** Self-contained recovery document for an unavailable shell renderer or preload. */
import type { DesktopLocale } from './locale.ts';
/**
 * Render escaped diagnostics without depending on application resource files.
 * @param locale - Shell-owned translations.
 * @param message - Failure details displayed as plain text.
 * @param profileRecovery - Whether the initialized application can repair its profile.
 * @returns An HTML document suitable for an isolated emergency window.
 */
export declare function startupFailureDocument(locale: DesktopLocale, message: string, profileRecovery?: boolean): string;
//# sourceMappingURL=startup-document.d.ts.map
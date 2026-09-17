/** Archived-session Settings page, browser half. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type ArchivedSessionsLocaleKey } from './locales.ts';
export type { ArchivedSessionsSectionInjected, ArchivedSessionsSectionProps } from './ArchivedSessionsSection.tsx';
export type { ArchivedSessionsLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Archived-session page copy. */
        'settings.archivedSessions': ArchivedSessionsLocaleKey;
    }
}
/** Services required by the Settings registration and the archive write. */
export declare const inject: string[];
/** Contribute the archived-session page to Settings. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map
/**
 * Archived-session Settings page: the registry-global archive set joined with
 * the loaded Session summaries, newest archive first, filtered by one search
 * box, with one Unarchive action per row. An archive entry whose Session is
 * gone has no row and no action; the set itself stays host-owned.
 */
import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Registration-side face used by the page. */
export interface ArchivedSessionsSectionInjected {
    /**
     * Restore one archived Session.
     * @param sessionId - Session to unarchive.
     */
    unarchive: (sessionId: SessionId) => Promise<void>;
}
/** Full component props assembled by the Settings slot renderer. */
export type ArchivedSessionsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.archivedSessions'> & InjectFace<ArchivedSessionsSectionInjected>;
/**
 * Render the archived-session page.
 * @param props - composed slot props (see {@link ArchivedSessionsSectionProps}).
 * @returns the settings page element tree.
 */
export declare function ArchivedSessionsSection(props: ArchivedSessionsSectionProps): ReactNode;
//# sourceMappingURL=ArchivedSessionsSection.d.ts.map
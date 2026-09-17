import type { SessionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ConversationSlotProps } from '../contract/slots.ts';
type ConversationContentProps = Omit<ConversationSlotProps, 'useSession' | 'useConversation'> & {
    session: SessionSnapshot | undefined;
    phase: 'settling' | 'hero' | 'active';
    hero: boolean;
    onHandleStart: () => number;
    onHandleDrag: (width: number) => void;
    onHandleCommit: (width: number) => void;
    onHandleEnd: () => void;
};
/**
 * Render the existing Conversation body, Composer, and width handles.
 * @param props - original Conversation seats plus MainPanel-derived phase and width callbacks.
 * @returns the unchanged Conversation body subtree.
 */
export declare function ConversationContent({ sessionId, session, phase, hero, useSessions, useSessionPendingInteraction, useWorkspaces, useInput, useComposerBlock, renderSlot, renderSlotChain, selectWorkspace, t, onHandleStart, onHandleDrag, onHandleCommit, onHandleEnd, }: ConversationContentProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ConversationContent.d.ts.map
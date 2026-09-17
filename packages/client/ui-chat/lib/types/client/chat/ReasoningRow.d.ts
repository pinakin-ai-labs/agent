import type { ChatViewSlotProps } from '../contract/slots.ts';
/**
 * Render one assistant reasoning block collapsed until the reader opens it. The
 * collapsed summary omits double-asterisk markers; expanded content preserves
 * the complete text.
 * @param props.text - complete or streaming reasoning text.
 * @param props.running - whether this block is the streaming tail.
 * @param props.t - conversation locale seat for the running status.
 * @returns the reasoning disclosure.
 */
export declare function ReasoningRow({ text, running, t }: {
    text: string;
    running: boolean;
    t: ChatViewSlotProps['t'];
}): import("react").JSX.Element;
//# sourceMappingURL=ReasoningRow.d.ts.map
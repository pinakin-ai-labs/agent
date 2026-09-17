/** Terminal glyphs for the sidebar guide and tab title. */
import type { ReactNode } from 'react';
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Render the tab title's terminal prompt in the surrounding text color.
 * @returns a decorative sixteen-pixel line glyph.
 */
export declare function TerminalIcon(): ReactNode;
/**
 * Render the guide's terminal card within the folder glyph's painted bounds.
 * @param props - canvas size and layout class supplied by the guide.
 * @returns a dark rounded terminal card with a white prompt.
 */
export declare function TerminalGuideIcon({ size, className }: IconProps): ReactNode;
//# sourceMappingURL=TerminalIcon.d.ts.map
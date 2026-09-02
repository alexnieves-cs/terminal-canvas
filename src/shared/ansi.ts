/**
 * M39. One ANSI stripper for the two readers of raw terminal bytes — main's
 * scrollback tail and, later, search and export. Shared so the card and the
 * log agree on what a line SAYS; two strippers would disagree on the day one
 * of them learns a new sequence.
 *
 * Imports nothing, so it costs the plain-node tier nothing (verify:usage).
 *
 * The OSC arm is the one worth having: an OSC string's BODY is text too
 * (`ESC ] 0 ; the title BEL`), and a stripper that only knew SGR would leak
 * "0;claude — ~/repo" into a card as though the agent had printed it. Both
 * terminators are handled — BEL and ST (`ESC \`) — the same grammar
 * agent-state.ts's bell scanner walks, for the same reason.
 */
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
const DCS = /\x1b[PX^_][^\x1b]*\x1b\\/g
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g
const ESC_SHORT = /\x1b[@-Z\\-_]/g
const BEL = /\x07/g

export function stripAnsi(text: string): string {
  return text.replace(OSC, '').replace(DCS, '').replace(CSI, '').replace(ESC_SHORT, '').replace(BEL, '')
}

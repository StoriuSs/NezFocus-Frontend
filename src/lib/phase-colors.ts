/**
 * The colours of a study phase (DESIGN.md › Colors), shared: the study
 * feature's ring and badges, the servers feature's room page and channel
 * list. Here, in the main stylesheet's files, so a page that shows a phase
 * without the study feature's own stylesheet has them (D-193).
 */
type SessionPhase = 'focus' | 'short_break' | 'long_break'

/** The phase's colour for its icon, name and number (DESIGN.md › Colors: phase colours only for the phase). */
export const PHASE_TEXT: Record<SessionPhase, string> = {
    focus: 'text-phase-focus',
    short_break: 'text-phase-short',
    long_break: 'text-phase-long'
}

/**
 * The content area's ground in a room with a session, joined or not (07 ›
 * Quy ước: `phase-*-room`, Q6); crossfading over `long` as the phase
 * changes (DESIGN.md › Motion, "Cả phòng thở ra").
 */
export const PHASE_ROOM: Record<SessionPhase, string> = {
    focus: 'bg-phase-focus-room',
    short_break: 'bg-phase-short-room',
    long_break: 'bg-phase-long-room'
}

import { lazy } from 'react'
import type { CycleFields as CycleFieldsComponent } from './components/CycleFields'

/**
 * What the app uses of study (M5): the sessions of study rooms (07), Solo
 * (08 S-STUDY-02) and, later, the stats (08).
 *
 * A room's session is the servers feature's data, on its room in GET
 * /servers: the servers feature keeps it there from what this feature hears
 * and the answers to its commands (`listenForSessions`, a port, D-231 L5-b),
 * and voice hands it in with the room. Imports go one way: `users, realtime
 * ← study ← voice ← servers`.
 *
 * The parts of a room's page (the ring, the controls, the dialogs, their
 * words) are one lazy chunk, `StudyStage`, which only a joined study room
 * fetches; the rest here is light: the cycle rules the room settings use,
 * the phase rules, the port, the store, the clocks of a phase. The phase as
 * the channel list and the dock show it is the shell's (`PhaseTag`, in the
 * main stylesheet's files: this feature's classes load with the room's page).
 */
export const StudyStage = lazy(() => import('./components/StudyStage'))
export type { ControlProps } from './components/StudyStage'
/** A study room's ring on its preview page (07 S-ROOM-01 `session-running`, `idle`), lazy as the stage. */
export const PreviewRing = lazy(() => import('./components/PreviewRing'))
/** The tab's title, the phase sound and the streak toast of the session one is in (07 S-ROOM-05), mounted by the shell. */
export const SessionCues = lazy(() => import('./components/SessionCues'))
/** The Solo page's stage (08 S-STUDY-02), lazy as a room's; its round controls handed in. */
export const SoloStage = lazy(() => import('./components/SoloStage'))
/**
 * One's Solo on every page (D-234): its cues and end toasts (`SoloWatch`,
 * mounted once by the AppShell), its dock under a room's (`SoloDockSlot`),
 * both light, their parts lazy; the question before a room's session ends it
 * (`useSoloYield`, the AppShell's dialog).
 */
export { SoloWatch } from './components/SoloWatch'
export { SoloDockSlot } from './components/SoloDockSlot'
export { SOLO_PATH, useSoloSession } from './api/useSoloSession'
export { useSoloYield } from './solo-yield.store'
export { useListClock } from './hooks/useListClock'
export { useSessionClock } from './hooks/useSessionClock'
export { phaseName, sessionLineText } from './lib/phase-words'
export * from './lib/study-cycle'
export { clockText, isLater, minutesLeft, remainingMs, roomSessionOf, roundOf } from './lib/phases'
export { listenForSessions, type SessionSink } from './api/liveSessions'
export { useEndedHere } from './hooks/useEndedHere'
/** Leaving as the Host asks first ("Rời phòng?", D-44, D-50, D-77); the dialog is the AppShell's, lazy. */
export { asksBeforeLeaving } from './lib/host-leave'
export { useHostLeave, type HostLeaveKind } from './host-leave.store'
/** One's seconds in a room's session as one's place closed (`focus_session.left`, D-233). */
export { hearSessionLeft } from './study.store'
export type {
    AnySession,
    FocusSession,
    RoomSession,
    SessionNews,
    SessionPhase,
    SessionSummary,
    StudyRoomView,
    StudyToday
} from './types'
/**
 * A room's settings' cycle (S-SET-06), the same fields as the start and cycle
 * dialogs': lazy with its words, so they stay out of the shell's chunks;
 * shown inside a Suspense. Typed as the component (lazy() drops its generics).
 */
export const CycleFields = lazy(() =>
    import('./components/CycleFields').then((module) => ({ default: module.CycleFields }))
) as unknown as typeof CycleFieldsComponent

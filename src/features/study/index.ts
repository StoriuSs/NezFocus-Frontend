import { lazy } from 'react'
import type { CycleFields as CycleFieldsComponent } from './components/CycleFields'

/**
 * What the app uses of study (M5): the sessions of study rooms (07) and,
 * later, Solo and the stats (08).
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
 * the phase rules and colours, the port, the store.
 */
export const StudyStage = lazy(() => import('./components/StudyStage'))
export type { ControlProps } from './components/StudyStage'
export * from './lib/study-cycle'
export { isLater, roomSessionOf } from './lib/phases'
export { listenForSessions, type SessionSink } from './api/liveSessions'
export { useEndedHere } from './hooks/useEndedHere'
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

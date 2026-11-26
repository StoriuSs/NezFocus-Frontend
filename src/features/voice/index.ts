import { lazy } from 'react'

/**
 * What the app uses of voice (M4): a room's page and the dock, lazy, with
 * LiveKit (`livekit-client`, `@livekit/components-react`), their words and
 * stylesheet a chunk of their own fetched when a room is opened or joined
 * (docs/code-splitting.md, CONSTRAINTS.md); and the light parts the shell
 * needs at once: which room this tab is in, the tab-wide session hook, the
 * order people show in, a moderator's menu on someone in a room (the
 * channel list's rows, D-208).
 *
 * The rooms themselves are the servers feature's data, handed in as
 * `VoiceRoom` (servers uses voice, never the other way round).
 */
export const VoiceRoomView = lazy(() => import('./components/VoiceRoomView'))
export const InRoomDock = lazy(() => import('./components/InRoomDock'))
/** The body of the panel "Người trong phòng" a "+N" seat opens (C-20 `list`), lazy with the room's page. */
export const RoomPeopleList = lazy(() => import('./components/RoomPeopleList'))
export { useVoiceSession } from './hooks/useVoiceSession'
/**
 * For a 1-1 call (social, D-255): one media link an account (D-210), so the
 * room this tab is in is left, with no Toast, as the call starts or is
 * answered; the browser asked for the mic before calling (D-36); the call's
 * page switches its mic with the same shortcut (Ctrl+Shift+M).
 */
export { leaveRoom } from './lib/session'
export { askMicrophone } from './lib/devices'
export { useMicShortcut, type MicControl } from './hooks/useMicShortcut'
/**
 * A room's round control (C-21), for the Solo page (08 S-STUDY-02): lazy, so
 * it and voice.css stay out of the shell's chunk; shown inside a Suspense.
 */
export const RoomControl = lazy(() =>
    import('./components/RoomControl').then((module) => ({ default: module.RoomControl }))
)
export { useRoomMenu } from './hooks/useRoomMenu'
export { ModeratorMenu } from './components/ModeratorMenu'
export { roomActionsOn } from './lib/room-actions'
export { useOrderedPeople } from './hooks/useOrderedPeople'
export { LISTED_PEOPLE, personName } from './lib/people'
export { chooseRoomView, useVoiceStore, type Call, type RoomView } from './voice.store'
export type { RoomPerson, VoiceDirectory, VoiceRoom } from './types'

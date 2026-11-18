import { lazy } from 'react'

/**
 * What the app uses of voice (M4): a room's page and the dock, lazy, with
 * LiveKit (`livekit-client`, `@livekit/components-react`), their words and
 * stylesheet a chunk of their own fetched when a room is opened or joined
 * (docs/code-splitting.md, CONSTRAINTS.md); and the light parts the shell
 * needs at once: which room this tab is in, the tab-wide session hook, the
 * order people show in.
 *
 * The rooms themselves are the servers feature's data, handed in as
 * `VoiceRoom` (servers uses voice, never the other way round).
 */
export const VoiceRoomView = lazy(() => import('./components/VoiceRoomView'))
export const InRoomDock = lazy(() => import('./components/InRoomDock'))
export { useVoiceSession } from './hooks/useVoiceSession'
export { useOrderedPeople } from './hooks/useOrderedPeople'
export { LISTED_PEOPLE, personName } from './lib/people'
export { useVoiceStore, type Call } from './voice.store'
export type { RoomPerson, VoiceDirectory, VoiceRoom } from './types'

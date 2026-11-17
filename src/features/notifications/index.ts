import { lazy } from 'react'

/**
 * What the app uses from notifications: the inbox (S-NOTI-01), the Popover
 * `panel` the rail opens, lazy, its words and stylesheet a chunk of their own
 * fetched the first time it opens (docs/code-splitting.md, D-193); and the
 * rail's badge, not lazy, which reads the inbox's first page at once and keeps
 * it live (`useUnreadNotificationCount`).
 *
 * The inbox takes the names of channels and servers and the path to a
 * message from the servers feature, handed by the app (`InboxPlaces`, D-197):
 * the servers feature may use notifications, never the other way round.
 */
export const InboxPanel = lazy(() => import('./components/InboxPanel'))
export { useUnreadNotificationCount } from './api/useInbox'
export type { InboxPlace, InboxPlaces } from './types'

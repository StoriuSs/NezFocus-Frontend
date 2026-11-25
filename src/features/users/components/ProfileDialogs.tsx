import { useSyncExternalStore } from 'react'
import { handedDialog, watchHandedDialog } from '../lib/profile-popover'

/**
 * Where a question or a moderation dialog a profile popover hands off is
 * drawn (D-253): by the AppShell, so it outlives what opened it (the
 * messages of someone just blocked fold away, a row moves to another group).
 */
export function ProfileDialogs() {
    return useSyncExternalStore(watchHandedDialog, handedDialog)
}

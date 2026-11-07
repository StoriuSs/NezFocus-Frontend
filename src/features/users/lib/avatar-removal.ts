import { toast } from 'sonner'
import type { QueryClient } from '@tanstack/react-query'
import { notifyMutationError } from '@/lib/query-client'
import { removeAvatar } from '../api/users.api'
import { userKeys } from '../api/keys'
import { useAvatarRemoval } from './avatar-removal-state'

/** How long "Undo" is offered after "Remove photo" (S-ME-02, Q6). */
export const AVATAR_UNDO_MS = 8000

/** The removal waiting, if any. Module-level: it outlives the profile page, as the toast does. */
let waiting: { timer: ReturnType<typeof setTimeout>; onLeave: () => void; toastId: string | number } | undefined

/** Ends the wait; false when there was none (already sent, or undone). */
function stopWaiting(): boolean {
    if (!waiting) return false
    clearTimeout(waiting.timer)
    window.removeEventListener('pagehide', waiting.onLeave)
    toast.dismiss(waiting.toastId)
    waiting = undefined
    return true
}

/**
 * "Remove photo" (S-ME-02): the avatar goes at once, but the API is asked
 * only once the toast's "Undo" has run out; "Undo" asks nothing. Closing or
 * reloading the tab during the wait still removes it (a keepalive request).
 */
export function removeAvatarWithUndo(client: QueryClient, text: { removed: string; undo: string }): void {
    if (waiting) return
    useAvatarRemoval.setState({ pending: true })

    async function send(onLeave: boolean) {
        if (!stopWaiting()) return
        try {
            await removeAvatar(onLeave)
            await client.invalidateQueries({ queryKey: userKeys.profile() })
        } catch (error) {
            notifyMutationError(error)
        } finally {
            useAvatarRemoval.setState({ pending: false })
        }
    }

    const onLeave = () => void send(true)
    window.addEventListener('pagehide', onLeave)
    waiting = {
        timer: setTimeout(() => void send(false), AVATAR_UNDO_MS),
        onLeave,
        toastId: toast.success(text.removed, {
            duration: AVATAR_UNDO_MS,
            action: { label: text.undo, onClick: cancelAvatarRemoval }
        })
    }
}

/** "Undo", or a new photo chosen meanwhile: the avatar stays, nothing is sent. */
export function cancelAvatarRemoval(): void {
    if (stopWaiting()) useAvatarRemoval.setState({ pending: false })
}

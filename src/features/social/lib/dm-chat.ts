import type { ChatPermissions, SendBlock } from '@/features/messaging'
import type { Dm, SocialPerson } from '../types'

/** An account deleted or waiting to be: no username, no name (D-182, D-243). */
export const isGone = (person: SocialPerson) => person.username === null && person.displayName === null

/**
 * Where a DM stands for me (S-DM-03): `deleted-account` (their account is
 * gone), `blocked-by-me` (someone I blocked: the strip in the composer's
 * place, their messages hidden), `cannot-message` (any other reason I may
 * not message them, one line for all, D-23), or `open`. Blocked comes
 * from my relationships, read before the server says `can_message`.
 */
export type DmStanding = 'open' | 'cannot-message' | 'blocked-by-me' | 'deleted-account'

export function dmStanding(dm: Pick<Dm, 'user' | 'canMessage'>, blocked: boolean): DmStanding {
    if (isGone(dm.user)) return 'deleted-account'
    if (blocked) return 'blocked-by-me'
    return dm.canMessage ? 'open' : 'cannot-message'
}

/**
 * What I may do with a DM's messages (D-238): both of us pin (the pins
 * panel too), each deletes only their own, no moderation, no @everyone nor
 * roles; sending, replying, editing, reactions and files only while I may
 * message them. Reading and pinning stay, whatever stands between us.
 */
export function dmChatPermissions(standing: DmStanding): ChatPermissions {
    const open = standing === 'open'
    const sendBlocked: SendBlock | null =
        standing === 'deleted-account' ? { reason: 'deleted-account' } : open ? null : { reason: 'cannot-message' }
    return {
        send: open,
        sendBlocked,
        manage: false,
        pins: true,
        deleteOwn: true,
        react: open,
        addReactions: open,
        mentionEveryone: false,
        attachFiles: open
    }
}

/** Whether the header shows their dot and activity: never where I may not message them (09 Q10, C-30). */
export const showsPresence = (standing: DmStanding) => standing === 'open'

import type { UserProfile } from '@/features/users'
import type { CachedPage, ChatMessage, MessageAuthor } from '../types'

/** What the list draws, oldest first: every saved message, then those still on their way. */
export function chatMessages(pages: CachedPage[] | undefined): ChatMessage[] {
    if (!pages) return []
    return [...pages.flatMap((page) => page.items), ...(pages.at(-1)?.outgoing ?? [])]
}

/** One's own profile as the author of a message being sent, drawn like a saved one's. */
export function authorFrom(profile: UserProfile | undefined): MessageAuthor | undefined {
    return (
        profile && {
            id: profile.id,
            username: profile.username ?? null,
            displayName: profile.displayName ?? null,
            avatarUrl: profile.avatarUrl
        }
    )
}

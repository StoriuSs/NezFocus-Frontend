import { safeSessionStorage } from '@/lib/safe-storage'

/** One person's draft in one channel: whoever signs in next in the tab never reads it. */
export const draftKey = (userId: string | undefined, channelId: string) => `draft:${userId ?? ''}:${channelId}`

/** Drops one person's drafts in channels they can no longer write in (forgetChannels). */
export function forgetDrafts(userId: string | undefined, channelIds: string[]): void {
    for (const channelId of channelIds) safeSessionStorage.remove(draftKey(userId, channelId))
}

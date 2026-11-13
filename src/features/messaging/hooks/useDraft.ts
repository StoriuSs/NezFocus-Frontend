import { useCallback, useState } from 'react'
import { safeSessionStorage } from '@/lib/safe-storage'

/** One person's draft in one channel: whoever signs in next in the tab never reads it. */
const draftKey = (userId: string | undefined, channelId: string) => `draft:${userId ?? ''}:${channelId}`

/**
 * What is typed in one channel's composer, kept until the tab closes
 * (C-12 › Luật: sessionStorage, per channel and per person). Changing
 * channel shows that channel's draft.
 */
export function useDraft(userId: string | undefined, channelId: string): [string, (text: string) => void] {
    const key = draftKey(userId, channelId)
    const [draft, setDraft] = useState<{ key: string; text: string } | null>(null)

    const change = useCallback(
        (text: string) => {
            setDraft({ key, text })
            if (text) safeSessionStorage.set(key, text)
            else safeSessionStorage.remove(key)
        },
        [key]
    )

    const text = draft?.key === key ? draft.text : (safeSessionStorage.get(key) ?? '')
    return [text, change]
}

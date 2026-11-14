import { useCallback, useState } from 'react'
import { safeSessionStorage } from '@/lib/safe-storage'
import type { ComposerNames } from '../lib/mention-text'

/** One person's draft in one channel: whoever signs in next in the tab never reads it. */
const draftKey = (userId: string | undefined, channelId: string) => `draft:${userId ?? ''}:${channelId}`

/** The text as it will be sent (mentions as tokens), and the names the box shows for them. */
export interface Draft {
    text: string
    names: ComposerNames
}

const EMPTY: Draft = { text: '', names: {} }

/** A draft as stored; plain text from before mentions (M2 L6a) reads as text with no names. */
function readDraft(stored: string | null): Draft {
    if (!stored) return EMPTY
    try {
        const draft = JSON.parse(stored) as Partial<Draft> | null
        if (draft && typeof draft.text === 'string') return { text: draft.text, names: draft.names ?? {} }
    } catch {
        // Plain text.
    }
    return { text: stored, names: {} }
}

/**
 * What is typed in one channel's composer, kept until the tab closes
 * (C-12 › Luật: sessionStorage, per channel and per person), with the names
 * of the mentions picked in it. Changing channel shows that channel's draft.
 */
export function useDraft(userId: string | undefined, channelId: string): [Draft, (draft: Draft) => void] {
    const key = draftKey(userId, channelId)
    const [draft, setDraft] = useState<{ key: string; value: Draft } | null>(null)

    const change = useCallback(
        (value: Draft) => {
            setDraft({ key, value })
            if (value.text) safeSessionStorage.set(key, JSON.stringify(value))
            else safeSessionStorage.remove(key)
        },
        [key]
    )

    const value = draft?.key === key ? draft.value : readDraft(safeSessionStorage.get(key))
    return [value, change]
}

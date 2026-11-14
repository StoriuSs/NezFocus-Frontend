import { useCallback, useMemo, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/messaging'
import { getApiErrorMessage, getApiErrorType } from '@/lib/api-error'
import { normaliseEmoji } from '../lib/emoji-data'
import { addReaction as addToCache, removeReaction as removeFromCache, removeSaved } from '../lib/message-cache'
import type { ChannelMessages } from '../types'
import { messageKeys } from './keys'
import { addReaction, removeReaction } from './reactions.api'

interface Toggle {
    messageId: string
    emoji: string
    /** Give it (true), or take one's own back. */
    give: boolean
}

/**
 * Clicks of one (message, emoji) still on their way, and whether the
 * server has it given by this person as far as the answers so far tell.
 */
interface Pending {
    count: number
    given: boolean
}

/** How a pick acts: a chip gives or takes back; the picker only gives (S-CHAT-03). */
export type ReactHow = 'toggle' | 'add'

/**
 * Giving an emoji or taking one's own back (REQ-MSG-05, SRS 1.71), on a
 * chip (`toggle`) or from the picker (`add`: one already given stays). What
 * the list holds says which; it shows at once.
 *
 * The requests go one after another, in the order clicked (PUT and DELETE
 * change nothing when already so), so the server ends as the last one that
 * got through left it. Once a run of clicks on one emoji has all answered,
 * the chip is set to that: a refusal puts back what the server has, not
 * the click before (two quick clicks that both fail end as at the start).
 * A refusal says why ("20 kinds of reactions" in the words of spec 11);
 * NOT_FOUND drops the message (deleted meanwhile), as an edit does.
 * `reaction.added` / `.removed` of one's own click change nothing more
 * (`message-cache`).
 */
export function useReactions(channelId: string) {
    const { t } = useTranslation('messaging')
    const client = useQueryClient()
    const key = useMemo(() => messageKeys.channel(channelId), [channelId])
    const pending = useRef(new Map<string, Pending>())
    const change = useCallback(
        (update: (history: ChannelMessages) => ChannelMessages) =>
            client.setQueryData<ChannelMessages>(key, (history) => history && update(history)),
        [client, key]
    )
    const mineNow = useCallback(
        (messageId: string, emoji: string) =>
            client
                .getQueryData<ChannelMessages>(key)
                ?.pages.flatMap((page) => page.items)
                .find((item) => item.id === messageId)
                ?.reactions.some((item) => item.emoji === emoji && item.me) ?? false,
        [client, key]
    )

    const { mutate } = useMutation({
        mutationFn: ({ messageId, emoji, give }: Toggle) =>
            give ? addReaction(messageId, emoji) : removeReaction(messageId, emoji),
        onMutate: ({ messageId, emoji, give }) =>
            change((history) =>
                give ? addToCache(history, messageId, emoji, true) : removeFromCache(history, messageId, emoji, true)
            ),
        onSuccess: (_, { messageId, emoji, give }) => {
            const run = pending.current.get(`${messageId} ${emoji}`)
            if (run) run.given = give
        },
        onError: (error) => {
            if (getApiErrorType(error) === 'NOT_FOUND_ERROR') return
            toast.error(
                getApiErrorType(error) === 'MAX_REACTIONS_REACHED' ? t('reactions.full') : getApiErrorMessage(error)
            )
        },
        onSettled: (_, error, { messageId, emoji }) => {
            if (getApiErrorType(error) === 'NOT_FOUND_ERROR') change((history) => removeSaved(history, messageId))
            const runKey = `${messageId} ${emoji}`
            const run = pending.current.get(runKey)
            if (!run || --run.count > 0) return
            pending.current.delete(runKey)
            // The run has all answered: the chip as the server has it.
            if (mineNow(messageId, emoji) === run.given) return
            change((history) =>
                run.given
                    ? addToCache(history, messageId, emoji, true)
                    : removeFromCache(history, messageId, emoji, true)
            )
        },
        scope: { id: `reactions:${channelId}` },
        meta: { errorToast: false }
    })

    return useCallback(
        (messageId: string, picked: string, how: ReactHow = 'toggle') => {
            const emoji = normaliseEmoji(picked) ?? picked
            const mine = mineNow(messageId, emoji)
            if (mine && how === 'add') return
            const runKey = `${messageId} ${emoji}`
            const run = pending.current.get(runKey) ?? { count: 0, given: mine }
            run.count += 1
            pending.current.set(runKey, run)
            mutate({ messageId, emoji, give: !mine })
        },
        [mineNow, mutate]
    )
}

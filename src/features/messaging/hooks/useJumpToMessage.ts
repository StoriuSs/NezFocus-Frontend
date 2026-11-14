import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/messaging'
import { getApiErrorMessage } from '@/lib/api-error'
import { useMessageJump } from '../api/useMessageJump'
import { stopsShort } from '../lib/message-cache'
import type { ChannelMessages, ChatTarget } from '../types'
import type { ScrollTarget } from './useChatScroll'

const rowOf = (messageId: string) =>
    document.querySelector<HTMLElement>(`[role="log"] article[data-row-key="${CSS.escape(messageId)}"]`)

/**
 * Going to a message of the channel (D-48, S-CHAT-01 `highlight`): the one a
 * link opened the page on (`target`, again each time the link is opened), or
 * one asked for from the list (`show`: the original of a reply). Once the
 * history holds it, the list scrolls it a third of the way down and it lights
 * up for a moment; asked from the list (or a target that says so), focus goes to it. Gone: the channel's
 * newest messages, and a Toast "This message was deleted".
 *
 * `backToPresent`: from a history that stops short (opened at an older
 * message), the newest page, at the bottom; false when it cannot be read
 * (a Toast says why). A channel left at an older message opens at its newest
 * messages again, as any channel does (S-CHAT-01).
 */
export function useJumpToMessage(
    channelId: string,
    target: ChatTarget | undefined,
    history: ChannelMessages | undefined
) {
    const { t } = useTranslation('messaging')
    const { show: jumpTo, toPresent } = useMessageJump(channelId)
    const [scrollTarget, setScrollTarget] = useState<ScrollTarget>()
    const [highlighted, setHighlighted] = useState<string>()

    const showMessage = useCallback(
        async (messageId: string, token: string, focus = false) => {
            const fromList = focus || !!document.activeElement?.closest('[role="log"]')
            try {
                if ((await jumpTo(messageId)) === 'gone') {
                    toast(t('message.gone'))
                    setScrollTarget({ key: null, token })
                    return
                }
                setScrollTarget({ key: messageId, token })
                setHighlighted(messageId)
                // After the list has drawn it and scrolled to it.
                if (fromList) requestAnimationFrame(() => rowOf(messageId)?.focus({ preventScroll: true }))
            } catch (error) {
                toast.error(getApiErrorMessage(error))
            }
        },
        [jumpTo, t]
    )

    const backToPresent = useCallback(async () => {
        setScrollTarget({ key: null, token: crypto.randomUUID() })
        try {
            await toPresent()
            return true
        } catch (error) {
            toast.error(getApiErrorMessage(error))
            return false
        }
    }, [toPresent])

    const loaded = history !== undefined
    // Each opening of a link, once the history is in.
    const opened = useRef<string | null>(null)
    useEffect(() => {
        if (!target || !loaded || opened.current === target.key) return
        opened.current = target.key
        void showMessage(target.messageId, target.key, target.focus)
    }, [target, loaded, showMessage])

    // Opened without a link on a history left at an older message: the newest, once.
    const checked = useRef(false)
    useEffect(() => {
        if (checked.current || !history) return
        checked.current = true
        if (!target && stopsShort(history)) void backToPresent()
    }, [history, target, backToPresent])

    const show = useCallback((messageId: string) => void showMessage(messageId, crypto.randomUUID()), [showMessage])
    const endHighlight = useCallback(() => setHighlighted(undefined), [])

    return { scrollTarget, highlighted, endHighlight, show, backToPresent }
}

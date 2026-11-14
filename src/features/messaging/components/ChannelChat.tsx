import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/messaging'
import { settingsCache, useProfile } from '@/features/users'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { useChannelMessages } from '../api/useChannelMessages'
import { useDeleteMessage } from '../api/useDeleteMessage'
import { useEditMessage } from '../api/useEditMessage'
import { usePinMessage } from '../api/usePinMessage'
import { useReactions } from '../api/useReactions'
import { useSendMessage } from '../api/useSendMessage'
import { useBrowserOnline } from '../hooks/useBrowserOnline'
import { useJumpToMessage } from '../hooks/useJumpToMessage'
import { authorFrom, chatMessages } from '../lib/chat-messages'
import { chatRows } from '../lib/chat-rows'
import { isGoneFrom, stopsShort } from '../lib/message-cache'
import { messageTime } from '../lib/message-time'
import type { AppLink, ChatPermissions, ChatTarget, Message, MessageHandlers, RepliedMessage } from '../types'
import { Composer } from './Composer'
import { DeleteMessageDialog } from './DeleteMessageDialog'
import { MessageList } from './MessageList'
import '../messaging.css'

// The pins panel (S-CHAT-02), shown by the servers feature's channel page: in this chunk, with the chat's stylesheet.
export { PinsPanel } from './PinsPanel'

const quote = (message: Message): RepliedMessage => ({
    id: message.id,
    author: message.author,
    content: message.content,
    deleted: false
})

/**
 * A text channel's chat (S-CHAT-01): the messages, the typing line's place
 * (24 high, kept empty so the list never jumps; C-10), and the composer.
 * Mounted once per channel (`key`), so scrolling starts afresh in each.
 *
 * Holds what is being done to a message (S-CHAT-01 `reply-mode`,
 * `edit-mode`; S-CHAT-03 `delete-confirm`), none of it kept on reload. A
 * message deleted elsewhere meanwhile: its editor closes with a Toast "This
 * message was deleted" (not when one deleted it oneself), its delete dialog
 * closes, and the reply strip says the original was deleted (the reply still
 * sends). Gone means missing where the history holds every message: one only
 * out of view (the list went to a link, or back to the newest) is not. The dialog quotes the message as it now is, and gives focus back to
 * it (or to the composer, once it is gone).
 *
 * Opened at a message (`target`, a message link; D-48), or going to the
 * original of a reply: `useJumpToMessage`. From a history that stops short of
 * the newest, ↓ and sending go back to them first; a message is sent once
 * they are in, and stays in the composer if they cannot be read.
 */
export default function ChannelChat({
    channelId,
    channelName,
    permissions,
    linkTo,
    readLink,
    target
}: {
    channelId: string
    channelName: string
    /** Read from the channel's permission bits by the page (the servers feature). */
    permissions: ChatPermissions
    /** The whole link to one of the channel's messages (the servers feature's paths). */
    linkTo: (messageId: string) => string
    /** How a link in a message shows (the servers feature knows its paths and what one sees). */
    readLink: (href: string) => AppLink | null
    /** The message the page was opened on, if any. */
    target?: ChatTarget
}) {
    const { t } = useTranslation('messaging')
    const profile = useProfile().data
    const timeZone = useQuery(settingsCache).data?.timezone
    const now = useMinuteClock()
    const online = useBrowserOnline()
    const history = useChannelMessages(channelId, target?.messageId)
    const author = useMemo(() => authorFrom(profile), [profile])
    const { send, retry, discard } = useSendMessage(channelId, author)
    const edit = useEditMessage(channelId)
    const remove = useDeleteMessage(channelId)
    const react = useReactions(channelId)
    const { pin, unpin } = usePinMessage(channelId)
    const composer = useRef<HTMLTextAreaElement>(null)
    /** The message one deleted oneself: its going is no news. */
    const deletedHere = useRef<string | null>(null)

    const [replyingTo, setReplyingTo] = useState<RepliedMessage | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const jump = useJumpToMessage(channelId, target, history.data)

    const pages = history.data?.pages
    const messages = useMemo(() => chatMessages(pages), [pages])
    const rows = useMemo(() => chatRows(messages, timeZone), [messages, timeZone])
    const saved = useMemo(
        () => new Map(pages?.flatMap((page) => page.items.map((item) => [item.id, item] as const))),
        [pages]
    )

    // A message gone while something was being done to it, read from what the
    // list holds (a history started over, too much missed, also loses it).
    const editingGone = editingId !== null && history.data !== undefined && isGoneFrom(history.data, editingId)
    useEffect(() => {
        if (!editingGone) return
        if (deletedHere.current !== editingId) toast(t('message.gone'))
        setEditingId(null)
    }, [editingGone, editingId, t])
    const deleting = deletingId ? saved.get(deletingId) : undefined
    useEffect(() => {
        if (deletingId && pages && !deleting) setDeletingId(null)
    }, [deletingId, deleting, pages])
    const replyQuote =
        replyingTo && (!history.data || !isGoneFrom(history.data, replyingTo.id))
            ? replyingTo
            : replyingTo && { ...replyingTo, author: null, content: '', deleted: true }

    const { hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage, refetch } = history
    const older = useMemo(
        () => ({ has: hasPreviousPage, loading: isFetchingPreviousPage, load: () => void fetchPreviousPage() }),
        [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]
    )
    const { hasNextPage, isFetchingNextPage, fetchNextPage } = history
    const newer = useMemo(
        () => ({ has: hasNextPage, loading: isFetchingNextPage, load: () => void fetchNextPage() }),
        [hasNextPage, isFetchingNextPage, fetchNextPage]
    )

    const backToComposer = useCallback(() => composer.current?.focus(), [])
    const copy = useCallback(
        (text: string) =>
            void navigator.clipboard.writeText(text).then(
                () => toast(t('actions.copied')),
                () => toast.error(t('actions.copyFailed'))
            ),
        [t]
    )
    const me = author?.id
    const handlers = useMemo<MessageHandlers>(
        () => ({
            me,
            permissions,
            reply: (message) => {
                setEditingId(null)
                setReplyingTo(quote(message))
                backToComposer()
            },
            edit: (message) => setEditingId(message.id),
            askDelete: (message) => setDeletingId(message.id),
            copyText: (message) => copy(message.content),
            copyLink: (message) => copy(linkTo(message.id)),
            react: (message, emoji, how) => react(message.id, emoji, how),
            pin: (message) => pin(message.id),
            unpin: (message) => unpin(message.id),
            show: jump.show,
            readLink
        }),
        [me, permissions, backToComposer, copy, linkTo, react, pin, unpin, jump.show, readLink]
    )

    const stopEditing = useCallback(() => {
        setEditingId(null)
        backToComposer()
    }, [backToComposer])
    const editingMessage = editingId ? saved.get(editingId) : undefined
    const editing = editingMessage && {
        messageId: editingMessage.id,
        editor: {
            saving: edit.isPending,
            cancel: stopEditing,
            save: (text: string) => {
                const content = text.trim()
                // Saved empty: "Delete message?" (S-CHAT-01 `edit-mode`; no files before L8).
                if (!content) return setDeletingId(editingMessage.id)
                if (content === editingMessage.content) return stopEditing()
                edit.mutate({ messageId: editingMessage.id, content }, { onSuccess: stopEditing })
            }
        }
    }

    /** ↑ in the empty composer: one's newest message (C-12 › Luật), when one may still edit. */
    const editLast = () => {
        if (!permissions.send) return false
        const last = [...saved.values()].reverse().find((item) => item.type === 'regular' && item.author?.id === me)
        if (last) setEditingId(last.id)
        return !!last
    }

    const sendReply = (text: string): boolean | Promise<boolean> => {
        const quoted = replyQuote
        const go = () => {
            const taken = send(text, quoted)
            if (taken) setReplyingTo(null)
            return taken
        }
        // Read at an older message: the newest come back first, so one's own lands after them.
        if (history.data && stopsShort(history.data)) return jump.backToPresent().then((back) => back && go())
        return go()
    }

    /** Back to the message the dialog was about, or to the composer once it is gone. */
    const afterDialog = (messageId: string) => {
        const row = document.querySelector<HTMLElement>(`article[data-row-key="${CSS.escape(messageId)}"]`)
        ;(row ?? composer.current)?.focus()
    }

    return (
        <>
            <MessageList
                channelName={channelName}
                rows={rows}
                status={pages ? 'ready' : history.isError ? 'error' : 'loading'}
                older={older}
                newer={newer}
                target={jump.scrollTarget}
                highlighted={jump.highlighted}
                onHighlightEnd={jump.endHighlight}
                onToPresent={() => void jump.backToPresent()}
                onReload={() => void refetch()}
                now={now}
                timeZone={timeZone}
                online={online}
                onRetry={retry}
                onDiscard={discard}
                handlers={handlers}
                editing={editing}
            />
            <div className='h-6 shrink-0' aria-hidden='true' />
            <Composer
                box={composer}
                userId={me}
                channelId={channelId}
                channelName={channelName}
                replyingTo={replyQuote}
                onCancelReply={() => setReplyingTo(null)}
                onEditLast={editLast}
                onSend={sendReply}
            />
            {deleting ? (
                <DeleteMessageDialog
                    message={deleting}
                    own={deleting.author?.id === me}
                    time={messageTime(new Date(deleting.createdAt), now, timeZone, t)}
                    deleting={remove.isPending}
                    onCancel={() => setDeletingId(null)}
                    onClosed={() => afterDialog(deleting.id)}
                    onConfirm={() => {
                        deletedHere.current = deleting.id
                        remove.mutate(deleting.id, {
                            onSettled: () => {
                                if (editingId === deleting.id) setEditingId(null)
                                setDeletingId(null)
                            }
                        })
                    }}
                />
            ) : null}
        </>
    )
}

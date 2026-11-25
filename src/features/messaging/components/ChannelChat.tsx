import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
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
import { useChannelReadState } from '../api/useReadStates'
import { useSendMessage } from '../api/useSendMessage'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { useCanSee } from '../hooks/useCanSee'
import { useJumpToMessage } from '../hooks/useJumpToMessage'
import { useMentionWords } from '../hooks/useMentionWords'
import { useUnreadMarker } from '../hooks/useUnreadMarker'
import { useTyping } from '../hooks/useTyping'
import { authorFrom, chatMessages } from '../lib/chat-messages'
import { chatRows } from '../lib/chat-rows'
import { outgoingMentions, type ComposerNames } from '../lib/mention-text'
import { readableText } from '../lib/mentions'
import { isGoneFrom, stopsShort } from '../lib/message-cache'
import { messageTime } from '../lib/message-time'
import type {
    AppLink,
    ChannelMessages,
    ChatMessage,
    ChatPermissions,
    ChatTarget,
    DmChatParts,
    MentionSource,
    Message,
    MessageHandlers,
    RepliedMessage
} from '../types'
import { isOutgoing } from '../types'
import { Composer } from './Composer'
import { ComposerDisabled } from './ComposerDisabled'
import { TypingLine } from './TypingLine'
import { DeleteMessageDialog } from './DeleteMessageDialog'
import { MessageList } from './MessageList'
import { NewMessagesBar } from './NewMessagesBar'
import '../messaging.css'

// The pins panel (S-CHAT-02), shown by the servers feature's channel page: in this chunk, with the chat's stylesheet.
export { PinsPanel } from './PinsPanel'
// Files dragged onto the channel's page (C-12 `drop-target`), drawn by that page over its content column.
export { ChatDropZone } from './attachments/ChatDropZone'

/** The viewer (C-42): fetched the first time a file is opened. */
const MediaViewer = lazy(() => import('./attachments/MediaViewer'))

/** Theirs, or a system message about them (a call they made): what a DM does not show of someone one blocked. */
const isAbout = (message: ChatMessage, userId: string) =>
    !isOutgoing(message) &&
    (message.author?.id === userId || (message.type === 'system' && message.systemData?.userId === userId))

const quote = (message: Message): RepliedMessage => ({
    id: message.id,
    author: message.author,
    content: message.content,
    deleted: false,
    mentionUsers: message.mentionUsers,
    mentionRoles: message.mentionRoles,
    files: {
        count: message.attachments.length,
        images: message.attachments.filter((file) => file.width !== null).length
    }
})

/**
 * A text channel's chat (S-CHAT-01): the messages, the typing line (24
 * high, kept when empty so the list never jumps; C-10, REQ-MSG-06), and the
 * composer.
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
 *
 * Mentions (REQ-MSG-03): the page hands the server's side of them
 * (`mentions`, the MentionSource port); "Copy text" gives their names
 * (owner, 14/11/2026).
 *
 * Unread messages (REQ-MSG-09, D-46): opened with some, the history starts
 * around the reader's mark and the list at "New" (`useUnreadMarker`), with
 * the new messages bar above it; what comes into view is read only while
 * the reader can see the page.
 *
 * An image or a PDF opens in the viewer (C-42), focus going back to it once
 * closed; its message deleted meanwhile, the viewer closes with a Toast
 * "Tin nhắn này đã bị xóa" (S-CHAT-04 › Edge case).
 *
 * A voice room's chat (S-ROOM-08) is the same chat in the room page's right
 * panel: `roomIcon` puts the room's icon and name where a channel has "#",
 * and the page gives no pins (`permissions.pins`, D-213).
 *
 * A DM's chat (S-DM-03, D-249) is the same chat too, `dm` handing what it
 * has of its own: the person named with no "#", its beginning, what stands
 * in the composer's place for someone one blocked, and whose messages it
 * does not show (that person's, and system ones about them: they still count
 * where the list counts, for the mark and "New").
 */
export default function ChannelChat({
    channelId,
    channelName,
    roomIcon,
    permissions,
    linkTo,
    readLink,
    mentions,
    target,
    showTask,
    dm
}: {
    channelId: string
    channelName: string
    /** A voice room's chat (S-ROOM-08): the room's icon, where a channel has "#". */
    roomIcon?: LucideIcon
    /** Read from the channel's permission bits by the page (the servers feature). */
    permissions: ChatPermissions
    /** The whole link to one of the channel's messages (the servers feature's paths). */
    linkTo: (messageId: string) => string
    /** How a link in a message shows (the servers feature knows its paths and what one sees). */
    readLink: (href: string) => AppLink | null
    /** Whom to suggest after @ and #, how a channel token shows, one's roles (the servers feature's). */
    mentions: MentionSource
    /** The message the page was opened on, if any. */
    target?: ChatTarget
    /** A task's detail opened over the page (`?task=`), from "Xem việc" on its reminder (05 S-TASK-01). */
    showTask?: (taskId: string) => void
    /** A DM's chat (S-DM-03): its parts the social feature hands (D-249). */
    dm?: DmChatParts
}) {
    const { t } = useTranslation('messaging')
    const words = useMentionWords()
    const profile = useProfile().data
    const timeZone = useQuery(settingsCache).data?.timezone
    const now = useMinuteClock()
    const online = useBrowserOnline()
    const canSee = useCanSee()
    const readState = useChannelReadState(channelId)
    // Opened with unread messages (the mark known already): the history starts around the mark.
    const [startAt] = useState(() =>
        !target && readState && readState.unreadCount > 0 ? readState.lastReadId : undefined
    )
    const history = useChannelMessages(channelId, target?.messageId ?? startAt)
    const author = useMemo(() => authorFrom(profile), [profile])
    const { send, historyReady, retry, discard } = useSendMessage(channelId, author)
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
    const [viewing, setViewing] = useState<{
        messageId: string
        fileId: string
        from: HTMLElement
        open: boolean
    } | null>(null)
    const jump = useJumpToMessage(channelId, target, history.data, { atUnread: startAt !== undefined })

    const pages = history.data?.pages
    const messages = useMemo(() => chatMessages(pages), [pages])
    const unread = useUnreadMarker({
        channelId,
        state: readState,
        history: history.data,
        messages,
        me: profile?.id,
        canSee,
        linked: !!target,
        jump
    })
    const hidden = dm?.hidden
    const rows = useMemo(
        () => chatRows(hidden ? messages.filter((message) => !isAbout(message, hidden)) : messages, timeZone),
        [messages, hidden, timeZone]
    )
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
    // Timed out, or the channel left to moderators, while editing: the edit stops (C-12 `disabled`).
    useEffect(() => {
        if (!permissions.send) setEditingId(null)
    }, [permissions.send])
    const deleting = deletingId ? saved.get(deletingId) : undefined
    useEffect(() => {
        if (deletingId && pages && !deleting) setDeletingId(null)
    }, [deletingId, deleting, pages])
    const viewed = viewing ? saved.get(viewing.messageId) : undefined
    const viewedFile = viewed?.attachments.find((file) => file.id === viewing?.fileId)
    const viewingGone = viewing !== null && history.data !== undefined && isGoneFrom(history.data, viewing.messageId)
    // Deleted: closed with a word. Only out of what the list holds (it started over): closed.
    const viewingLost = viewing !== null && pages !== undefined && !viewedFile
    useEffect(() => {
        if (!viewingLost) return
        if (viewingGone && deletedHere.current !== viewing?.messageId) toast(t('viewer.deleted'))
        setViewing(null)
    }, [viewingLost, viewingGone, viewing, t])
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
    const typing = useTyping(channelId, me)
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
            copyText: (message) =>
                copy(
                    readableText(
                        message.content,
                        { users: message.mentionUsers, roles: message.mentionRoles, channel: mentions.channel },
                        words
                    )
                ),
            copyLink: (message) => copy(linkTo(message.id)),
            react: (message, emoji, how) => react(message.id, emoji, how),
            pin: (message) => pin(message.id),
            unpin: (message) => unpin(message.id),
            show: jump.show,
            showTask,
            readLink,
            mentions,
            openFile: (message, file, from) => setViewing({ messageId: message.id, fileId: file.id, from, open: true })
        }),
        [
            me,
            permissions,
            backToComposer,
            copy,
            words,
            mentions,
            linkTo,
            react,
            pin,
            unpin,
            jump.show,
            showTask,
            readLink
        ]
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
                if (content === editingMessage.content) return stopEditing()
                // Saved empty: "Delete message?", unless it has files: then it is files alone (S-CHAT-01 `edit-mode`).
                if (!content && !editingMessage.attachments.length) return setDeletingId(editingMessage.id)
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

    const sendReply = (text: string, names: ComposerNames): boolean | Promise<boolean> => {
        const quoted = replyQuote
        const go = () => {
            const taken = send(text, quoted, outgoingMentions(text, names, permissions.mentionEveryone))
            if (taken) setReplyingTo(null)
            return taken
        }
        // Read at an older message: the newest come back first, so one's own lands after them.
        const after = (loaded: ChannelMessages) =>
            stopsShort(loaded) ? jump.backToPresent().then((back) => back && go()) : go()
        // Typed before the first page came (S-CHAT-01 `loading`): sent once it comes, the same way.
        if (!history.data) return historyReady().then((loaded) => (loaded ? after(loaded) : false))
        return after(history.data)
    }

    /** Back to the message the dialog was about, or to the composer once it is gone. */
    const afterDialog = (messageId: string) => {
        const row = document.querySelector<HTMLElement>(`article[data-row-key="${CSS.escape(messageId)}"]`)
        ;(row ?? composer.current)?.focus()
    }

    return (
        <>
            {unread.bar ? (
                <NewMessagesBar
                    count={unread.bar.count}
                    since={messageTime(new Date(unread.bar.since), now, timeZone, t)}
                    onShow={() => void unread.toDivider()}
                    onMarkRead={unread.markAllRead}
                />
            ) : null}
            <MessageList
                channelName={channelName}
                roomIcon={roomIcon}
                intro={dm?.intro}
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
                newFrom={unread.dividerAt}
                unreadHeld={unread.unreadHeld}
                holdNew={!canSee}
                onSeen={canSee && unread.unreadHeld > 0 ? unread.seen : undefined}
            />
            <TypingLine names={typing} />
            {dm?.footer ? (
                dm.footer
            ) : permissions.sendBlocked ? (
                <ComposerDisabled blocked={permissions.sendBlocked} now={now} timeZone={timeZone} room={!!roomIcon} />
            ) : (
                <Composer
                    box={composer}
                    userId={me}
                    channelId={channelId}
                    channelName={channelName}
                    room={!!roomIcon}
                    dm={!!dm}
                    replyingTo={replyQuote}
                    onCancelReply={() => setReplyingTo(null)}
                    onEditLast={editLast}
                    onSend={sendReply}
                    source={mentions}
                    mentionEveryone={permissions.mentionEveryone}
                    attachFiles={permissions.attachFiles}
                />
            )}
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
            {viewing && viewed && viewedFile ? (
                <Suspense fallback={null}>
                    <MediaViewer
                        open={viewing.open}
                        message={viewed}
                        file={viewedFile}
                        now={now}
                        timeZone={timeZone}
                        onMove={(fileId) => setViewing({ ...viewing, fileId })}
                        // Faded out first (C-42), then gone.
                        onClose={() => setViewing({ ...viewing, open: false })}
                        onClosed={() => {
                            ;(viewing.from.isConnected ? viewing.from : composer.current)?.focus()
                            setViewing(null)
                        }}
                    />
                </Suspense>
            ) : null}
        </>
    )
}

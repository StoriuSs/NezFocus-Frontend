import { useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import type { AppLink, ChatPermissions, ChatTarget, MentionSource } from '@/features/messaging'
import { useBlockedIds } from '@/features/social'
import { useMentionSource } from '../api/useMentionSource'
import { useServers } from '../api/useServers'
import { linkedServers, readAppLink, type LinkedServer } from '../lib/app-links'
import { chatPermissions } from '../lib/chat-permissions'
import { messageLink } from '../lib/paths'
import type { Server, ServerChannel } from '../types'
import { useVisitKey } from './useVisitKey'

/** What the messaging feature's chat takes from the page that shows it. */
export interface ChannelChatProps {
    permissions: ChatPermissions
    linkTo: (messageId: string) => string
    readLink: (href: string) => AppLink | null
    mentions: MentionSource
    target?: ChatTarget
    /** Whom one blocked: their messages fold (the social feature's, D-250). */
    blocked: ReadonlySet<string>
}

/**
 * The chat of a channel, as the page hands it over: a text channel's
 * (S-CHAT-01) or a voice room's (S-ROOM-08). What one may do with messages
 * there (read from the permission bits here, as the chat reads none), how to
 * link to one of them, how links in messages show (this feature's paths and
 * the servers one is in), and the server's side of mentions
 * (`useMentionSource`), and whom one blocked (the social feature's
 * `useBlockedIds`: their messages fold, D-250). All kept from one render to
 * the next while they stay the same, so the chat's rows do not draw again.
 *
 * Opened at a message (`messageId`), the chat goes to it, again each time a
 * link to it is opened; from the pins sheet, which closes with the focus in
 * it, focus goes to the message.
 */
export function useChannelChat(server: Server, channel: ServerChannel, messageId?: string): ChannelChatProps {
    const { id: serverId, timeoutUntil } = server
    const { id: channelId, permissions: bits, sendMode, type } = channel
    // Again when the server is read again: at the end of a timeout too (liveServers).
    const permissions = useMemo(
        () => chatPermissions({ timeoutUntil }, { permissions: bits, sendMode, type }, new Date()),
        [timeoutUntil, bits, sendMode, type]
    )
    const linkTo = useCallback((id: string) => messageLink(serverId, channelId, id), [serverId, channelId])
    const linked = linkedServers(useServers().data ?? [])
    const readLink = useMemo(() => {
        const servers = JSON.parse(linked) as LinkedServer[]
        return (href: string) => readAppLink(href, { origin: window.location.origin, servers, serverId })
    }, [linked, serverId])
    const mentions = useMentionSource(server, linked)
    const { state } = useLocation()
    const focus = (state as { focusMessage?: boolean } | null)?.focusMessage === true
    // A link followed again jumps again; a task's detail opened over the page (`?task=`) does not.
    const visit = useVisitKey()
    const target = useMemo(() => (messageId ? { messageId, key: visit, focus } : undefined), [messageId, visit, focus])
    const blocked = useBlockedIds()
    return { permissions, linkTo, readLink, mentions, target, blocked }
}

import { Suspense, useCallback, useMemo } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Hash, LampDesk, Pin, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/servers'
import { PageLoader } from '@/components/PageLoader'
import { RightPanel, usePanel } from '@/components/shell/RightPanel'
import { ShellNotFound } from '@/components/shell/ShellNotFound'
import { ShellPage } from '@/components/shell/ShellPage'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { ChannelChat, PinsPanel } from '@/features/messaging'
import { useMentionSource } from '../api/useMentionSource'
import { useServers } from '../api/useServers'
import { linkedServers, readAppLink, type LinkedServer } from '../lib/app-links'
import { chatPermissions } from '../lib/chat-permissions'
import { firstTextChannel } from '../lib/channel-list'
import { channelPath, isId, messageLink, messagePath } from '../lib/paths'
import type { Server, ServerChannel } from '../types'

/**
 * A channel of one of their servers. Opening a server without a channel, or a
 * channel they cannot see, lands on its first text channel (02 S-SHELL-01).
 * A server they are not in (any more) leads back to the Study page.
 *
 * A link to a message (`/channels/{s}/{c}/{m}`, D-48) opens its channel at
 * that message. One to a text channel they cannot see, in a server they are
 * not in, to anything but a text channel, or with an id that is not one, is
 * "We can't find this page"
 * (11 S-MOD-06), the URL kept, saying nothing of what is there (REQ-MSG-05).
 * Links to channels keep M1's way until L9 (plan M2 L4b).
 *
 * A text channel holds its chat (S-CHAT-01, the messaging feature's), a
 * chunk of its own; voice rooms come in M4 (D-144), which until then say so.
 */
export default function ChannelPage() {
    const { t } = useTranslation()
    const { serverId, channelId, messageId } = useParams()
    const servers = useServers()

    if (servers.isPending) return <PageLoader className='min-h-0 flex-1' />
    // The page's error boundary offers to try again, only with nothing to
    // show: a failed re-read (back to the tab, after a kick) keeps the last
    // list, so the page stays.
    if (servers.data === undefined) throw servers.error

    const server = servers.data.find((candidate) => candidate.id === serverId)
    const channel = server?.channels.find((candidate) => candidate.id === channelId)
    if (messageId !== undefined && (channel?.type !== 'text' || !isId(messageId))) return <ShellNotFound />
    if (!server) return <Navigate to='/study' replace />

    if (!channel) {
        const first = firstTextChannel(server)
        if (first) return <Navigate to={channelPath(server.id, first.id)} replace />
        return <ShellPage title={server.name} />
    }

    if (channel.type === 'voice') {
        return (
            <ShellPage title={channel.name} icon={channel.isStudyRoom ? LampDesk : Volume2}>
                <div className='flex min-h-full items-start justify-center px-4 pt-[18vh]'>
                    <EmptyState title={t('shell.voiceSoon.title')}>{t('shell.voiceSoon.body')}</EmptyState>
                </div>
            </ShellPage>
        )
    }

    return <TextChannel key={channel.id} server={server} channel={channel} messageId={messageId} />
}

/**
 * A text channel's page: its chat, with what one may do with messages there
 * (read from the permission bits here, as the chat reads none), how to link
 * to one of them, and how links in messages show (this feature's paths and
 * the servers one is in). All kept from one render to the next while they
 * stay the same, so the chat's rows do not draw again. Opened at a message,
 * the chat goes to it, again each time a link to it is opened.
 *
 * Mentions (REQ-MSG-03): the chat's MentionSource port answered here
 * (`useMentionSource`): whom to suggest, how a channel token shows, the
 * roles one holds.
 *
 * [📌] in the Header opens the pins (S-CHAT-02) in the right panel, closed
 * at first and remembered as a column (SRS 1.71); a card opens its message's
 * link, closing the panel when it covers the chat (a sheet below 1280),
 * focus then on the message.
 */
function TextChannel({ server, channel, messageId }: { server: Server; channel: ServerChannel; messageId?: string }) {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const [pins, pinsButton] = usePanel('pins', { startClosed: true })
    const { id: serverId, timeoutUntil } = server
    const { id: channelId, permissions: bits } = channel
    const permissions = useMemo(
        () => chatPermissions({ timeoutUntil }, { permissions: bits }, new Date()),
        [timeoutUntil, bits]
    )
    const linkTo = useCallback((id: string) => messageLink(serverId, channelId, id), [serverId, channelId])
    const linked = linkedServers(useServers().data ?? [])
    const readLink = useMemo(() => {
        const servers = JSON.parse(linked) as LinkedServer[]
        return (href: string) => readAppLink(href, { origin: window.location.origin, servers, serverId })
    }, [linked, serverId])
    const mentions = useMentionSource(server, linked)
    const { key, state } = useLocation()
    // From the pins sheet, which closes with the focus in it: focus goes to the message.
    const focus = (state as { focusMessage?: boolean } | null)?.focusMessage === true
    const target = useMemo(() => (messageId ? { messageId, key, focus } : undefined), [messageId, key, focus])
    const openPinned = (pinnedId: string) => {
        // As a column the panel stays, focus on its card; as a sheet it closes, focus to the message.
        void navigate(messagePath(serverId, channelId, pinnedId), { state: { focusMessage: !pins.docked } })
        if (!pins.docked) pins.close()
    }

    return (
        <ShellPage
            title={channel.name}
            icon={Hash}
            composer
            bodyClassName='flex flex-col overflow-y-hidden'
            actions={
                <WithTooltip label={t('channel.pins')} side='bottom'>
                    <IconButton ref={pinsButton} label={t('channel.pins')} on={pins.open} onClick={pins.toggle}>
                        <Pin />
                    </IconButton>
                </WithTooltip>
            }
            panel={
                <RightPanel state={pins} buttonRef={pinsButton} title={t('channel.pins')}>
                    <Suspense fallback={<PageLoader className='min-h-0 py-6' />}>
                        <PinsPanel
                            channelId={channelId}
                            manage={permissions.manage}
                            onOpen={openPinned}
                            channel={mentions.channel}
                        />
                    </Suspense>
                </RightPanel>
            }
        >
            <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                <ChannelChat
                    channelId={channelId}
                    channelName={channel.name}
                    permissions={permissions}
                    linkTo={linkTo}
                    readLink={readLink}
                    mentions={mentions}
                    target={target}
                />
            </Suspense>
        </ShellPage>
    )
}

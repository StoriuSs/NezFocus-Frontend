import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Hash, LampDesk, ListChecks, Pin, Users, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/servers'
import { PageLoader } from '@/components/PageLoader'
import { RightPanel, usePanel } from '@/components/shell/RightPanel'
import { ShellNotFound } from '@/components/shell/ShellNotFound'
import { ShellPage } from '@/components/shell/ShellPage'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { ChannelChat, ChatDropZone, PinsPanel } from '@/features/messaging'
import { TaskBoard } from '@/features/tasks'
import { useVoiceStore, VoiceRoomView } from '@/features/voice'
import { useMentionSource } from '../api/useMentionSource'
import { MemberPanel } from '../components/member-panel/MemberPanel'
import { useServers } from '../api/useServers'
import { useTaskBoardPlace } from '../api/useTaskBoardPlace'
import { useVisitKey } from '../hooks/useVisitKey'
import { useChannelDialogs } from '../channel-dialogs.store'
import { useGoneServerPath } from '../hooks/useGoneServerPath'
import { linkedServers, readAppLink, type LinkedServer } from '../lib/app-links'
import { chatPermissions } from '../lib/chat-permissions'
import { firstTextChannel } from '../lib/channel-list'
import { voiceRoomOf } from '../lib/voice-room'
import { channelPath, isId, messageLink, messagePath } from '../lib/paths'
import type { Server, ServerChannel } from '../types'

/**
 * A channel of one of their servers. Opening a server without a channel lands
 * on its first text channel (02 S-SHELL-01); the address of a channel they
 * cannot see is "We can't find this page" (02 S-CHAT-01 `forbidden`, 11
 * S-MOD-06). A server they are not in leads back to the Study page.
 *
 * Live (D-178): the channel open here deleted, or no longer seen, goes to the
 * first text channel with a Toast "This channel is no longer available" (02
 * `channel-removed`); the server leaving the list goes to the next one on
 * the rail (`useGoneServerPath`).
 *
 * A link to a message (`/channels/{s}/{c}/{m}`, D-48) opens its channel at
 * that message. One to a text channel they cannot see, in a server they are
 * not in, to anything but a text channel, or with an id that is not one, is
 * "We can't find this page"
 * (11 S-MOD-06), the URL kept, saying nothing of what is there (REQ-MSG-05).
 *
 * A text channel holds its chat (S-CHAT-01, the messaging feature's), a
 * chunk of its own; a voice room its preview page or, once joined, the room
 * (07, the voice feature's), a chunk of its own too.
 */
export default function ChannelPage() {
    const { serverId, channelId, messageId } = useParams()
    const servers = useServers()
    const goneTo = useGoneServerPath(serverId, servers.data)
    const server = servers.data?.find((candidate) => candidate.id === serverId)
    const channel = server?.channels.find((candidate) => candidate.id === channelId)
    // The channel this page last showed: missing now, it was removed while open.
    const here = `${serverId}/${channelId}`
    const [shown, setShown] = useState<string | null>(null)
    if (channel && shown !== here) setShown(here)
    // This tab is in that room, or was just put out of it: gone, it is a room that is gone (07 ROOM-EDGE).
    const wasIn = useVoiceStore(
        (state) =>
            channelId !== undefined && (state.call?.channelId === channelId || state.removed?.channelId === channelId)
    )

    if (servers.isPending) return <PageLoader className='min-h-0 flex-1' />
    // The page's error boundary offers to try again, only with nothing to
    // show: a failed re-read (the socket back, after a kick) keeps the last
    // list, so the page stays.
    if (servers.data === undefined) throw servers.error

    if (goneTo) return <Navigate to={goneTo} replace />
    if (server && !channel && shown === here) {
        const first = firstTextChannel(server)
        return <Removed to={channelPath(server.id, first?.id)} room={wasIn} />
    }
    if (messageId !== undefined && (channel?.type !== 'text' || !isId(messageId))) return <ShellNotFound />
    if (!server) return <Navigate to='/study' replace />

    if (!channel) {
        if (channelId !== undefined) return <ShellNotFound />
        const first = firstTextChannel(server)
        if (first) return <Navigate to={channelPath(server.id, first.id)} replace />
        return <ShellPage title={server.name} />
    }

    if (channel.type === 'voice') {
        return (
            <ShellPage title={channel.name} icon={channel.isStudyRoom ? LampDesk : Volume2}>
                <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                    <VoiceRoomView room={voiceRoomOf(server, channel)} />
                </Suspense>
            </ShellPage>
        )
    }

    return <TextChannel key={channel.id} server={server} channel={channel} messageId={messageId} />
}

/**
 * The channel open here was deleted, or is no longer seen: said once, then
 * elsewhere (02 `channel-removed`). A voice room this tab was in says the
 * room is gone, the words voice says when the server puts one out of it
 * for that (D-212), under the same Toast id: one Toast whichever comes first.
 */
function Removed({ to, room }: { to: string; room: boolean }) {
    const { t } = useTranslation()
    const notice = t(room ? 'shell.voice.roomGone' : 'shell.channelGone')
    useEffect(() => void toast(notice, { id: 'channel-removed' }), [notice])
    return <Navigate to={to} replace />
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
 * Files dragged onto the page go to the chat's tray (`ChatDropZone`, C-12
 * `drop-target`), over the whole content column.
 *
 * [📌] in the Header opens the pins (S-CHAT-02) in the right panel, closed
 * at first and remembered as a column (SRS 1.71); a card opens its message's
 * link, closing the panel when it covers the chat (a sheet below 1280),
 * focus then on the message. [👥] opens the members (S-SHELL-01, D-175),
 * open at first as a column. [list-checks], on a channel with its Task
 * Board on, opens the board (S-TASK-01, the tasks feature's), closed at
 * first and remembered as a column; turned off while open, the board says
 * so (`board-off`) and the button stays until the panel closes; a task's
 * channel line comes with it open (`openTasks`, S-TASK-02). One panel at a
 * time: opening one closes the others (S-CHAT-02 › Mở từ, C-08).
 */
function TextChannel({ server, channel, messageId }: { server: Server; channel: ServerChannel; messageId?: string }) {
    const { t } = useTranslation('servers')
    const { t: common } = useTranslation()
    const navigate = useNavigate()
    const [pins, pinsButton] = usePanel('pins', { startClosed: true })
    const [members, membersButton] = usePanel('members')
    const [tasks, tasksButton] = usePanel('tasks', { startClosed: true })
    // The board turned off while shown here stays (`board-off`) until the panel closes.
    const [boardShown, setBoardShown] = useState(false)
    const showTasks = tasks.open && (channel.taskBoardEnabled || boardShown)
    if (showTasks !== boardShown) setBoardShown(showTasks)
    const showPins = pins.open && !showTasks
    const showMembers = members.open && !pins.open && !showTasks
    // The pins and the board hide the members while open; closed, the members come back as they were.
    const togglePins = () => {
        if (!pins.open && tasks.open) tasks.close()
        pins.toggle()
    }
    const toggleTasks = () => {
        if (!showTasks && pins.open) pins.close()
        tasks.toggle()
    }
    const toggleMembers = () => {
        if (!showMembers && pins.open) pins.close()
        if (!showMembers && tasks.open) tasks.close()
        if (!members.open || showMembers) members.toggle()
    }
    const showDialog = useChannelDialogs((state) => state.show)
    const openSettings = useCallback(
        () => showDialog({ kind: 'channelSettings', serverId: server.id, channelId: channel.id }),
        [showDialog, server.id, channel.id]
    )
    const place = useTaskBoardPlace(server, channel, openSettings)
    const { id: serverId, timeoutUntil } = server
    const { id: channelId, permissions: bits, sendMode } = channel
    // Again when the server is read again: at the end of a timeout too (liveServers).
    const permissions = useMemo(
        () => chatPermissions({ timeoutUntil }, { permissions: bits, sendMode }, new Date()),
        [timeoutUntil, bits, sendMode]
    )
    const linkTo = useCallback((id: string) => messageLink(serverId, channelId, id), [serverId, channelId])
    // "Xem việc" on a due-date reminder: the task's detail over this page, no step in the history (05 Q6).
    const [, setParams] = useSearchParams()
    const showTask = useCallback(
        (taskId: string) =>
            setParams(
                (before) => {
                    const next = new URLSearchParams(before)
                    next.set('task', taskId)
                    return next
                },
                { replace: true }
            ),
        [setParams]
    )
    const linked = linkedServers(useServers().data ?? [])
    const readLink = useMemo(() => {
        const servers = JSON.parse(linked) as LinkedServer[]
        return (href: string) => readAppLink(href, { origin: window.location.origin, servers, serverId })
    }, [linked, serverId])
    const mentions = useMentionSource(server, linked)
    const { key, state } = useLocation()
    // From a task's channel line (S-TASK-02): the board open, once per visit.
    const wantsTasks = (state as { openTasks?: boolean } | null)?.openTasks === true
    const tasksAsked = useRef<string | null>(null)
    useEffect(() => {
        if (!wantsTasks || tasksAsked.current === key) return
        tasksAsked.current = key
        if (!showTasks) toggleTasks()
    })
    // From the pins sheet, which closes with the focus in it: focus goes to the message.
    const focus = (state as { focusMessage?: boolean } | null)?.focusMessage === true
    // A link followed again jumps again; a task's detail opened over the page (`?task=`) does not.
    const visit = useVisitKey()
    const target = useMemo(() => (messageId ? { messageId, key: visit, focus } : undefined), [messageId, visit, focus])
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
            overlay={
                <Suspense fallback={null}>
                    <ChatDropZone
                        key={channelId}
                        channelId={channelId}
                        channelName={channel.name}
                        permissions={permissions}
                    />
                </Suspense>
            }
            actions={
                <>
                    <WithTooltip label={t('channel.pins')} side='bottom'>
                        <IconButton ref={pinsButton} label={t('channel.pins')} on={showPins} onClick={togglePins}>
                            <Pin />
                        </IconButton>
                    </WithTooltip>
                    {channel.taskBoardEnabled || showTasks ? (
                        <WithTooltip label={t('channel.taskBoard.label')} side='bottom'>
                            <IconButton
                                ref={tasksButton}
                                label={t('channel.taskBoard.label')}
                                on={showTasks}
                                onClick={toggleTasks}
                            >
                                <ListChecks />
                            </IconButton>
                        </WithTooltip>
                    ) : null}
                    <WithTooltip label={common('shell.members.title')} side='bottom'>
                        <IconButton
                            ref={membersButton}
                            label={common('shell.members.title')}
                            on={showMembers}
                            onClick={toggleMembers}
                        >
                            <Users />
                        </IconButton>
                    </WithTooltip>
                </>
            }
            panel={
                showTasks ? (
                    <Suspense
                        fallback={
                            <RightPanel state={tasks} buttonRef={tasksButton} title={t('channel.taskBoard.label')}>
                                <PageLoader className='min-h-0 py-6' />
                            </RightPanel>
                        }
                    >
                        <TaskBoard
                            panel={tasks}
                            buttonRef={tasksButton}
                            place={place}
                            enabled={channel.taskBoardEnabled}
                        />
                    </Suspense>
                ) : showMembers ? (
                    <RightPanel state={members} buttonRef={membersButton} title={common('shell.members.title')}>
                        <MemberPanel serverId={serverId} />
                    </RightPanel>
                ) : (
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
                )
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
                    showTask={showTask}
                />
            </Suspense>
        </ShellPage>
    )
}

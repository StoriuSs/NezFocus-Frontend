import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Hash, ListChecks, Lock, MessageSquare, Pin, UserPlus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/servers'
import { PageLoader } from '@/components/PageLoader'
import { RightPanel, usePanel } from '@/components/shell/RightPanel'
import { ShellNotFound } from '@/components/shell/ShellNotFound'
import { ShellPage } from '@/components/shell/ShellPage'
import { CountBadge } from '@/components/ui/count-badge'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { LIST_SHOWS, useMediaQuery } from '@/hooks/useMediaQuery'
import { PHASE_ROOM } from '@/lib/phase-colors'
import { ChannelChat, ChatDropZone, PinsPanel, useChannelReadState } from '@/features/messaging'
import { EndedOnArrival } from '@/features/study'
import { TaskBoard } from '@/features/tasks'
import { useProfile } from '@/features/users'
import { RoomPeopleList, useVoiceStore, VoiceRoomView } from '@/features/voice'
import { MemberPanel } from '../components/member-panel/MemberPanel'
import { HostChip, RoomViewSwitch } from '../components/RoomHeader'
import { useServers } from '../api/useServers'
import { useTaskBoardPlace } from '../api/useTaskBoardPlace'
import { useChannelChat } from '../hooks/useChannelChat'
import { useChannelDialogs } from '../channel-dialogs.store'
import { useGoneServerPath } from '../hooks/useGoneServerPath'
import { useJoinedSession } from '../hooks/useJoinedSession'
import { useRoomInvite } from '../hooks/useRoomInvite'
import { channelIcon, firstTextChannel } from '../lib/channel-list'
import { STUDY_ROW_MS, studyRowOf, type StudyRow } from '../lib/live-rooms'
import { voiceRoomOf } from '../lib/voice-room'
import { channelPath, isId, messagePath } from '../lib/paths'
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
 * that message, or its room with the room's chat open at it (S-ROOM-08). One
 * to a channel they cannot see, in a server they are not in, or with an id
 * that is not one, is "We can't find this page"
 * (11 S-MOD-06), the URL kept, saying nothing of what is there (REQ-MSG-05).
 *
 * A text channel holds its chat (S-CHAT-01, the messaging feature's), a
 * chunk of its own; a voice room its preview page or, once joined, the room
 * (07, the voice feature's), a chunk of its own too, with the room's chat
 * beside it (S-ROOM-08).
 */
export default function ChannelPage() {
    const { serverId, channelId, messageId } = useParams()
    const location = useLocation()
    const studyRow = useStudyRow()
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

    // A room the Study page still listed, no longer one's to open (put out of the server, made private): back there.
    if (studyRow && !wasIn && (goneTo || (server && !channel))) return <LostRoom name={studyRow.name} />
    if (goneTo) return <Navigate to={goneTo} replace />
    if (server && !channel && shown === here) {
        const first = firstTextChannel(server)
        return <Removed to={channelPath(server.id, first?.id)} room={wasIn} />
    }
    if (messageId !== undefined && (!channel || !isId(messageId))) return <ShellNotFound />
    if (!server) return <Navigate to='/study' replace />

    if (!channel) {
        if (channelId !== undefined) return <ShellNotFound />
        const first = firstTextChannel(server)
        if (first) return <Navigate to={channelPath(server.id, first.id)} replace />
        return <ShellPage title={server.name} />
    }

    // Keyed: another room's page starts afresh (its people panel closed, D-233 L6b).
    if (channel.type === 'voice')
        return (
            <>
                {studyRow && !wasIn ? (
                    <Suspense fallback={null}>
                        <EndedOnArrival key={location.key} channelId={channel.id} sessionId={studyRow.sessionId} />
                    </Suspense>
                ) : null}
                <VoiceChannel key={channel.id} server={server} channel={channel} messageId={messageId} />
            </>
        )

    return <TextChannel key={channel.id} server={server} channel={channel} messageId={messageId} />
}

/**
 * The Study page row this page was opened from (08 › Edge: a session just
 * ended, a room just lost), for STUDY_ROW_MS: then taken off the history
 * entry, so a room lost or ended later, or the page come back to, is told
 * as any other.
 */
function useStudyRow(): StudyRow | null {
    const location = useLocation()
    const navigate = useNavigate()
    const row = studyRowOf(location.state)
    const held = row !== null
    const { key, pathname, search, hash } = location
    useEffect(() => {
        if (!held) return
        const timer = setTimeout(
            () => void navigate({ pathname, search, hash }, { replace: true, state: null }),
            STUDY_ROW_MS
        )
        return () => clearTimeout(timer)
    }, [held, key, pathname, search, hash, navigate])
    return row
}

/**
 * A room opened from a Study page row that is no longer one's to open,
 * found as the list catches up (08 › Edge: put out of the server, the room
 * made private): Toast `lock` "Bạn không còn quyền vào {phòng}", back to
 * the Study page. Under the same Toast id as `Removed`.
 */
function LostRoom({ name }: { name: string }) {
    const { t } = useTranslation('servers')
    const notice = t('lostRoom', { name })
    useEffect(
        () => void toast(notice, { id: 'channel-removed', icon: <Lock className='size-4' aria-hidden='true' /> }),
        [notice]
    )
    return <Navigate to='/study' replace />
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
 * A voice room's page (07): its preview or, once joined, the room (the voice
 * feature's), and the room's chat (S-ROOM-08) in the right panel, opened by
 * [💬] at the end of the Header (C-07 `room`): closed at first and
 * remembered as a column, kept as it is on joining or leaving the room (P10).
 * Closed, [💬] has the mentions of the reader still unread as a Badge, or a
 * dot when only plain messages are (C-07, C-03 `dot`). A message link or an
 * inbox item opens the panel at the message, once per visit. The chat is the
 * text channel's (`useChannelChat`), named with the room's icon in place of
 * "#", with no pins (D-213); files dragged onto the panel go to its tray,
 * and anywhere else they do nothing (the AppShell's `useRefuseFileDrops`),
 * rather than the browser opening the file and leaving the room (L6b-a).
 *
 * A study room with a session has the phase's ground under its Header and
 * page, joined or not (07 › Quy ước, Q6), crossfading over `long` as the
 * phase changes; once joined, the Header has the Host chip (C-04) and the
 * Ring / Grid switch (D-55, D-57; none while a screen is shared, 07 P6).
 */
function VoiceChannel({ server, channel, messageId }: { server: Server; channel: ServerChannel; messageId?: string }) {
    const { t } = useTranslation('servers')
    const { t: common } = useTranslation()
    const [chat, chatButton] = usePanel('room-chat', { startClosed: true })
    // "Người trong phòng", opened by a "+N" seat (C-18), never kept: it shows in the chat's place,
    // the chat's own choice kept (C-08: one right panel at a time).
    const [roster] = usePanel('room-people', { startClosed: true, remember: false })
    // The "+N" seat that opened it, and the order of the seats then (the panel lists them so, C-18).
    const rosterSeat = useRef<HTMLButtonElement | null>(null)
    const [rosterOrder, setRosterOrder] = useState<string[]>([])
    const openRoster = (seat: HTMLButtonElement, order: string[]) => {
        rosterSeat.current = seat
        setRosterOrder(order)
        if (!roster.open) roster.toggle()
    }
    // Closed, the focus goes back to the seat, or to the chat's button once the seat is gone (joined, fewer people).
    const rosterReturn = {
        get current() {
            return rosterSeat.current?.isConnected ? rosterSeat.current : chatButton.current
        }
    }
    const chatShown = chat.open && !roster.open
    const toggleChat = () => {
        if (!roster.open) return chat.toggle()
        roster.close()
        if (!chat.open) chat.toggle()
    }
    const { permissions, linkTo, readLink, mentions, target, blocked } = useChannelChat(server, channel, messageId)
    const icon = channelIcon(channel)
    // A message link or an inbox item: the chat open at it, once per visit.
    const [openedAt, setOpenedAt] = useState<string | null>(null)
    useEffect(() => {
        if (!target || openedAt === target.key) return
        setOpenedAt(target.key)
        if (roster.open) roster.close()
        if (!chat.open) chat.toggle()
    }, [target, openedAt, chat, roster])
    // Closed after that, the chat opens again where it would without the link: the URL keeps the message.
    const [spent, setSpent] = useState<string | null>(null)
    if (target && openedAt === target.key && !chat.open && spent !== target.key) setSpent(target.key)
    const chatTarget = target && target.key !== spent ? target : undefined
    const read = useChannelReadState(channel.id)
    const mentioned = chatShown ? 0 : (read?.mentionCount ?? 0)
    const unread = !chatShown && (mentioned > 0 || (read?.unreadCount ?? 0) > 0)
    const title = t('channel.roomChat')
    // In this room and LiveKit trying again: the page says so as the dock does elsewhere (S-ROOM-06, M4 A3).
    const reconnecting = useVoiceStore(
        (state) => state.call?.channelId === channel.id && state.call.phase === 'reconnecting'
    )
    const me = useProfile().data?.id
    const inside = useVoiceStore((state) => state.call?.channelId === channel.id && state.call.phase !== 'joining')
    // The session of the room one is in: its Host is asked before switching here (D-50).
    const joinedSession = useJoinedSession()
    // "Mời vào phòng" once in the room (07 S-ROOM-02, D-218; not on the preview page, Q6): a label from 1024, an icon below.
    const roomInvite = useRoomInvite(server, channel)
    const wide = useMediaQuery(LIST_SHOWS)
    const session = channel.focusSession
    const people = channel.voiceStates ?? []
    const label = unread
        ? common('shell.unread.label', {
              name: title,
              state:
                  mentioned > 0
                      ? common('shell.unread.mentions', { count: mentioned })
                      : common('shell.unread.messages')
          })
        : title

    return (
        <ShellPage
            title={channel.name}
            icon={icon}
            composer={chatShown}
            reconnecting={reconnecting}
            className={
                session
                    ? `${PHASE_ROOM[session.phase]} transition-colors duration-long ease-in-out motion-reduce:duration-short`
                    : undefined
            }
            afterTitle={inside && session && me ? <HostChip session={session} people={people} me={me} /> : undefined}
            actions={
                <>
                    {inside && channel.isStudyRoom && !people.some((person) => person.screenSharing) ? (
                        <RoomViewSwitch cameras={people.filter((person) => person.cameraOn).length} />
                    ) : null}
                    {inside ? (
                        wide ? (
                            <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                aria-busy={roomInvite.busy || undefined}
                                onClick={roomInvite.invite}
                            >
                                <UserPlus aria-hidden='true' />
                                {t('channel.inviteToRoom')}
                            </Button>
                        ) : (
                            <WithTooltip label={t('channel.inviteToRoom')} side='bottom'>
                                <IconButton
                                    label={t('channel.inviteToRoom')}
                                    aria-busy={roomInvite.busy || undefined}
                                    onClick={roomInvite.invite}
                                >
                                    <UserPlus />
                                </IconButton>
                            </WithTooltip>
                        )
                    ) : null}
                    <WithTooltip label={title} side='bottom'>
                        <IconButton
                            ref={chatButton}
                            label={label}
                            on={chatShown}
                            onClick={toggleChat}
                            className='relative'
                        >
                            <MessageSquare />
                            {mentioned > 0 ? (
                                <CountBadge
                                    count={mentioned}
                                    cutout='ring-bg'
                                    className='pointer-events-none absolute -right-1 -top-1'
                                />
                            ) : unread ? (
                                <span
                                    aria-hidden='true'
                                    data-testid='room-chat-dot'
                                    className='pointer-events-none absolute right-0.5 top-0.5 size-2 rounded-full bg-danger ring-2 ring-bg'
                                />
                            ) : null}
                        </IconButton>
                    </WithTooltip>
                </>
            }
            panel={
                roster.open ? (
                    <RightPanel
                        state={roster}
                        buttonRef={rosterReturn}
                        title={common('shell.voice.roomPeople', { count: people.length })}
                        closable
                    >
                        <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                            <RoomPeopleList
                                people={people}
                                me={me}
                                hostId={session?.hostId ?? null}
                                order={rosterOrder}
                            />
                        </Suspense>
                    </RightPanel>
                ) : (
                    <RightPanel
                        state={chat}
                        buttonRef={chatButton}
                        title={title}
                        bodyClassName='relative flex flex-col overflow-y-hidden p-0'
                    >
                        <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                            <ChatDropZone
                                channelId={channel.id}
                                channelName={channel.name}
                                room
                                permissions={permissions}
                            />
                            <ChannelChat
                                key={channel.id}
                                channelId={channel.id}
                                channelName={channel.name}
                                roomIcon={icon}
                                permissions={permissions}
                                linkTo={linkTo}
                                readLink={readLink}
                                mentions={mentions}
                                target={chatTarget}
                                blocked={blocked}
                            />
                        </Suspense>
                    </RightPanel>
                )
            }
        >
            <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                <VoiceRoomView
                    room={voiceRoomOf(server, channel)}
                    joinedSession={joinedSession}
                    onMorePeople={openRoster}
                />
            </Suspense>
        </ShellPage>
    )
}

/**
 * A text channel's page: its chat (`useChannelChat`: what one may do there,
 * links, mentions, the message it was opened at).
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
    const { id: serverId } = server
    const { id: channelId } = channel
    const { permissions, linkTo, readLink, mentions, target, blocked } = useChannelChat(server, channel, messageId)
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
    const { key, state } = useLocation()
    // From a task's channel line (S-TASK-02): the board open, once per visit.
    const wantsTasks = (state as { openTasks?: boolean } | null)?.openTasks === true
    const tasksAsked = useRef<string | null>(null)
    useEffect(() => {
        if (!wantsTasks || tasksAsked.current === key) return
        tasksAsked.current = key
        if (!showTasks) toggleTasks()
    })
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
                                manage={permissions.pins}
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
                    blocked={blocked}
                />
            </Suspense>
        </ShellPage>
    )
}

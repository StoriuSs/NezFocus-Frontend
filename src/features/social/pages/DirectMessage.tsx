import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Pin, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { PageLoader } from '@/components/PageLoader'
import { RightPanel, usePanel } from '@/components/shell/RightPanel'
import { ShellContext } from '@/components/shell/shell-context'
import { ShellNotFound } from '@/components/shell/ShellNotFound'
import { ShellPage } from '@/components/shell/ShellPage'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { ChannelChat, ChatDropZone, PinsPanel, type MentionSource } from '@/features/messaging'
import { ProfileTrigger } from '@/features/users'
import { useDmList } from '../api/useDms'
import { useMyCall } from '../api/useMyCall'
import { useCallStore } from '../call.store'
import { CallButtons } from '../components/call/CallButtons'
import { useCallPress } from '../hooks/useCallPress'
import { useRelationships } from '../api/useRelationships'
import { socialKeys } from '../api/keys'
import { ActivityLine } from '../components/ActivityLine'
import { BlockedStrip } from '../components/BlockedStrip'
import { ConfirmRelationshipDialog, type ConfirmKind } from '../components/ConfirmRelationshipDialog'
import { DmIntro } from '../components/DmIntro'
import { DmProfile } from '../components/DmProfile'
import { FriendStrip } from '../components/FriendStrip'
import { usePersonMoves } from '../hooks/usePersonMoves'
import { PersonAvatar } from '../components/PersonAvatar'
import { useConnectedChatLinks } from '../lib/chat-links'
import { activityShown } from '../lib/activity-line'
import { dmChatPermissions, dmStanding, isGone, showsPresence } from '../lib/dm-chat'
import { friendStrip, relationshipWith } from '../lib/dm-profile'
import { nameOf } from '../lib/friends-list'
import { dmMessageLink, dmMessagePath, friendsPath } from '../lib/paths'
import type { Dm } from '../types'
import '../social.css'

/** The call's page (C-48), with LiveKit's React parts: fetched only once a call of the DM is held here. */
const CallStage = lazy(() => import('../components/call/CallStage'))

/** A message id is a UUID: anything else in `/dm/{id}/{…}` is no page. */
const isId = (id: string | undefined): id is string =>
    !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

/**
 * A DM (S-DM-03): the Header `dm` (C-07), the chat of its channel (the
 * messaging feature's, as a channel's, with the DM's parts: D-249 L7-c), the
 * right panel: [👤] the profile (C-50, D-251; open at first as a column,
 * remembered, as a channel's members), [📌] the pins (S-CHAT-02, closed at
 * first), one at a time: the pins hide the profile while open.
 *
 * Opened from its row, "Message" or a link `/dm/{id}/{message}` (D-48). A DM
 * my list does not hold (closed, an old link) reads the list again once,
 * then is "We can't find this page" (11 S-MOD-06, D-249 L7-d).
 *
 * Where it stands (`dmStanding`): someone I may not message has the locked
 * composer (`cannot-message`, one line for every reason, D-23) and no dot in
 * the Header (09 Q10); a deleted account "Deleted account" and its own line;
 * someone I blocked has the strip with Unblock in the composer's place, and
 * their messages hidden (`blocked-by-me`). A message refused because I may
 * no longer write to them (09 DM-EDGE `lost-permission`, D-250) reads the
 * list again, so the page turns `cannot-message`. While I may message
 * them and we are not friends, the `not-friend` strip under the Header
 * (D-251). Their study activity after the username and in the panel, where
 * the dot shows and they are not offline (C-07 `dm`, C-30, D-252).
 *
 * Calls (09 S-CALL-01, D-255): Gọi thoại · Gọi video in the Header where I
 * may message them; "Gọi lại" on a call's message. While this tab holds a
 * call of this DM, or for the seconds its result shows, the call's page
 * takes the content area (C-48; its chat in the right panel comes with L9b).
 */
export default function DirectMessage() {
    const { dmId = '', messageId } = useParams()
    if (messageId !== undefined && !isId(messageId)) return <ShellNotFound />
    // Keyed: another DM starts afresh (its chat, its scroll, whether the list was read again for it).
    return <DmVisit key={dmId} dmId={dmId} messageId={messageId} />
}

function DmVisit({ dmId, messageId }: { dmId: string; messageId?: string }) {
    const client = useQueryClient()
    const select = useCallback((dms: Dm[]) => dms.find((dm) => dm.id === dmId) ?? null, [dmId])
    const { data: dm, dataUpdatedAt, errorUpdatedAt, isError, error, errorUpdateCount } = useDmList(select)
    const [openedAt] = useState(() => Date.now())
    // Shown in this visit, then gone (closed here or in another tab): to the Friends page (S-DM-01 › Đóng tin nhắn).
    const [shown, setShown] = useState(false)
    if (dm && !shown) setShown(true)
    // Not held by a list read before this visit, or the list never read (its first failure): read again once.
    const stale =
        (dm === null && Math.max(dataUpdatedAt, errorUpdatedAt) < openedAt) ||
        (dm === undefined && isError && errorUpdateCount < 2)
    useEffect(() => {
        if (stale) void client.refetchQueries({ queryKey: socialKeys.dms() })
    }, [stale, client])

    if (shown && !dm) return <Navigate to={friendsPath()} replace />
    if (stale || (dm === undefined && !isError)) return <PageLoader className='min-h-0 flex-1' />
    // Read again and failed again: the page's error boundary offers to try once more.
    if (dm === undefined) throw error
    if (dm === null) return <ShellNotFound />
    return <DmChat dm={dm} messageId={messageId} />
}

function DmChat({ dm, messageId }: { dm: Dm; messageId?: string }) {
    const { t } = useTranslation('social')
    const { t: tc } = useTranslation()
    const client = useQueryClient()
    const navigate = useNavigate()
    const { key, state } = useLocation()
    const offline = useContext(ShellContext)?.connection === 'offline'
    const [pins, pinsButton] = usePanel('pins', { startClosed: true })
    const [profile, profileButton] = usePanel('dm-profile')
    const showProfile = profile.open && !pins.open
    // The pins hide the profile while open; closed, the profile comes back as it was.
    const toggleProfile = () => {
        if (!showProfile && pins.open) pins.close()
        if (!profile.open || showProfile) profile.toggle()
    }
    const links = useConnectedChatLinks()
    const relationship = relationshipWith(useRelationships().data, dm.user.id)
    const standing = dmStanding(dm, relationship === 'blocked')
    const permissions = useMemo(() => dmChatPermissions(standing), [standing])
    const gone = isGone(dm.user)
    const name = nameOf(dm.user) ?? t('dm.deleted')
    const person = dm.user
    const [confirming, setConfirming] = useState<ConfirmKind | null>(null)
    const moves = usePersonMoves(person, name, setConfirming)
    const { unblock: unblockPerson, busy } = moves
    const strip = friendStrip(standing, relationship)
    // Their activity where their dot shows, not while offline (C-30, D-252).
    const studies = activityShown(dm.presence, showsPresence(standing))
    // The strip gone (accepted, declined, blocked) with the focus in it: the focus to the composer, if any.
    const chat = useRef<HTMLDivElement>(null)
    const hadStrip = useRef(strip !== null)
    useEffect(() => {
        const had = hadStrip.current
        hadStrip.current = strip !== null
        if (!had || strip) return
        const focused = document.activeElement
        if (!focused || focused === document.body) chat.current?.querySelector('textarea')?.focus()
    }, [strip])

    // The other one alone after @ (D-238): the chat keeps them when their name starts a word of what was typed.
    const mentions = useMemo<MentionSource>(
        () => ({
            members: (query) => ({
                queryKey: socialKeys.dmMentions(dm.id, query),
                queryFn: () =>
                    Promise.resolve(
                        isGone(person)
                            ? []
                            : [
                                  {
                                      id: person.id,
                                      username: person.username,
                                      displayName: person.displayName,
                                      avatarUrl: person.avatarUrl
                                  }
                              ]
                    ),
                staleTime: Infinity
            }),
            roles: { queryKey: socialKeys.dmRoles(), queryFn: () => Promise.resolve([]) },
            channels: [],
            channel: links.channel,
            roleIds: []
        }),
        [dm.id, person, links.channel]
    )
    const linkTo = useCallback((id: string) => dmMessageLink(dm.id, id), [dm.id])
    const focus = (state as { focusMessage?: boolean } | null)?.focusMessage === true
    const target = useMemo(() => (messageId ? { messageId, key, focus } : undefined), [messageId, key, focus])
    const openPinned = (pinnedId: string) => {
        // As a column the panel stays, focus on its card; as a sheet it closes, focus to the message.
        void navigate(dmMessagePath(dm.id, pinnedId), { state: { focusMessage: !pins.docked } })
        if (!pins.docked) pins.close()
    }
    // The same from one render to the next: the chat tells it once per refused message, not on each new `parts`.
    const onRefused = useCallback(() => void client.refetchQueries({ queryKey: socialKeys.dms() }), [client])
    // This tab's call of this DM, or its result: the call's page in place of the chat (C-48).
    const onCall = useCallStore((store) => store.current?.call.dmId === dm.id || store.result?.call.dmId === dm.id)
    // "Gọi lại" where a call may start: I may message them, online, no call of mine going on (09 S-CALL-01).
    const inCall = useMyCall((my) => my.current !== null).data ?? false
    const { call } = useCallPress()
    // The call's page gone with the focus in it (its result closed): to the composer, as the strip's going does.
    const hadCall = useRef(onCall)
    useEffect(() => {
        const had = hadCall.current
        hadCall.current = onCall
        if (!had || onCall) return
        const focused = document.activeElement
        if (!focused || focused === document.body) chat.current?.querySelector('textarea')?.focus()
    }, [onCall])
    const dmId = dm.id
    const callBack = useMemo(
        () => (standing === 'open' && !offline && !inCall ? (video: boolean) => void call(dmId, video) : undefined),
        [standing, offline, inCall, call, dmId]
    )
    const parts = useMemo(
        () => ({
            intro: <DmIntro person={person} />,
            footer:
                standing === 'blocked-by-me' ? (
                    <BlockedStrip name={name} offline={offline} unblocking={busy} onUnblock={unblockPerson} />
                ) : undefined,
            hidden: standing === 'blocked-by-me' ? person.id : null,
            onRefused,
            callBack
        }),
        [person, standing, name, offline, busy, unblockPerson, onRefused, callBack]
    )

    return (
        <ShellPage
            title={name}
            // Their name and avatar open their profile, outside a server (S-CHAT-05, D-252 4e, L8b2-a); the panel's [👤] shows it in full.
            // A deleted account's name stays words (its h1 spans the Header): its avatar alone opens it.
            titleTrigger={
                gone
                    ? undefined
                    : (title) => (
                          <ProfileTrigger
                              userId={person.id}
                              serverId={null}
                              name={name}
                              avatarUrl={person.avatarUrl}
                              side='bottom'
                              className='block truncate rounded-input hover:underline'
                          >
                              {title}
                          </ProfileTrigger>
                      )
            }
            subtitle={gone ? undefined : (person.username ?? undefined)}
            status={
                studies && dm.activity ? (
                    <ActivityLine userId={person.id} activity={dm.activity} form='full' separated />
                ) : undefined
            }
            leading={
                // The same button as the name, off the Tab order: one stop per person (a deleted account's: the stop).
                <ProfileTrigger
                    userId={person.id}
                    serverId={null}
                    name={name}
                    avatarUrl={person.avatarUrl}
                    label={tc('shell.profileOf', { name })}
                    tabbable={gone}
                    side='bottom'
                    className='shrink-0 rounded-full'
                >
                    <PersonAvatar
                        person={person}
                        presence={showsPresence(standing) ? dm.presence : null}
                        dot={8}
                        className='size-6'
                        initialClassName='text-micro'
                        iconClassName='size-3.5'
                    />
                </ProfileTrigger>
            }
            composer={standing === 'open' && !onCall}
            bodyClassName='flex flex-col overflow-y-hidden'
            overlay={
                onCall ? undefined : (
                    <Suspense fallback={null}>
                        <ChatDropZone channelId={dm.id} channelName={name} dm permissions={permissions} />
                    </Suspense>
                )
            }
            actions={
                <>
                    {standing === 'open' ? <CallButtons dmId={dm.id} offline={offline} /> : null}
                    <WithTooltip label={t('dm.pins')} side='bottom'>
                        <IconButton ref={pinsButton} label={t('dm.pins')} on={pins.open} onClick={pins.toggle}>
                            <Pin />
                        </IconButton>
                    </WithTooltip>
                    <WithTooltip label={t('profile.title')} side='bottom'>
                        <IconButton
                            ref={profileButton}
                            label={t('profile.title')}
                            on={showProfile}
                            onClick={toggleProfile}
                        >
                            <UserRound />
                        </IconButton>
                    </WithTooltip>
                </>
            }
            panel={
                pins.open ? (
                    <RightPanel state={pins} buttonRef={pinsButton} title={t('dm.pins')}>
                        <Suspense fallback={<PageLoader className='min-h-0 py-6' />}>
                            <PinsPanel channelId={dm.id} manage onOpen={openPinned} channel={links.channel} />
                        </Suspense>
                    </RightPanel>
                ) : (
                    <RightPanel
                        state={profile}
                        buttonRef={profileButton}
                        title={t('profile.title')}
                        bodyClassName='p-4'
                    >
                        <DmProfile
                            person={person}
                            name={name}
                            presence={showsPresence(standing) ? dm.presence : null}
                            activity={studies ? dm.activity : null}
                            relationship={relationship}
                            offline={offline}
                            moves={moves}
                            links={links}
                        />
                    </RightPanel>
                )
            }
        >
            {confirming ? (
                <ConfirmRelationshipDialog
                    kind={confirming}
                    userId={person.id}
                    name={name}
                    onClose={() => setConfirming(null)}
                />
            ) : null}
            {onCall ? (
                <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                    <CallStage person={person} name={name} />
                </Suspense>
            ) : null}
            <div
                ref={chat}
                data-call-hidden={onCall || undefined}
                className={onCall ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}
            >
                {strip ? <FriendStrip kind={strip} name={name} offline={offline} moves={moves} /> : null}
                <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                    <ChannelChat
                        channelId={dm.id}
                        serverId={null}
                        channelName={name}
                        permissions={permissions}
                        linkTo={linkTo}
                        readLink={links.readLink}
                        mentions={mentions}
                        target={target}
                        dm={parts}
                    />
                </Suspense>
            </div>
        </ShellPage>
    )
}

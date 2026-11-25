import { Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Pin } from 'lucide-react'
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
import { useDmList } from '../api/useDms'
import { useRelationships } from '../api/useRelationships'
import { useUnblockPerson } from '../api/useRelationshipActions'
import { socialKeys } from '../api/keys'
import { BlockedStrip } from '../components/BlockedStrip'
import { DmIntro } from '../components/DmIntro'
import { PersonAvatar } from '../components/PersonAvatar'
import { useConnectedChatLinks } from '../lib/chat-links'
import { dmChatPermissions, dmStanding, isGone, showsPresence } from '../lib/dm-chat'
import { nameOf } from '../lib/friends-list'
import { dmMessageLink, dmMessagePath, friendsPath } from '../lib/paths'
import type { Dm } from '../types'
import '../social.css'

/** A message id is a UUID: anything else in `/dm/{id}/{…}` is no page. */
const isId = (id: string | undefined): id is string =>
    !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

/**
 * A DM (S-DM-03): the Header `dm` (C-07), the chat of its channel (the
 * messaging feature's, as a channel's, with the DM's parts: D-249 L7-c), the
 * pins in the right panel (S-CHAT-02, closed at first, remembered as a
 * column, as a channel's).
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
 * list again, so the page turns `cannot-message`. The profile panel (C-50)
 * and the `not-friend` strip come with L7c, the activity line with L8, the
 * calls with L9.
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
    const client = useQueryClient()
    const navigate = useNavigate()
    const { key, state } = useLocation()
    const offline = useContext(ShellContext)?.connection === 'offline'
    const [pins, pinsButton] = usePanel('pins', { startClosed: true })
    const links = useConnectedChatLinks()
    const relationships = useRelationships().data
    const blocked = relationships?.some((entry) => entry.type === 'blocked' && entry.user.id === dm.user.id) ?? false
    const standing = dmStanding(dm, blocked)
    const permissions = useMemo(() => dmChatPermissions(standing), [standing])
    const { mutate: unblockPerson, isPending: unblocking } = useUnblockPerson()
    const gone = isGone(dm.user)
    const name = nameOf(dm.user) ?? t('dm.deleted')
    const person = dm.user

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
    const parts = useMemo(
        () => ({
            intro: <DmIntro person={person} />,
            footer:
                standing === 'blocked-by-me' ? (
                    <BlockedStrip
                        name={name}
                        offline={offline}
                        unblocking={unblocking}
                        onUnblock={() => unblockPerson(person.id)}
                    />
                ) : undefined,
            hidden: standing === 'blocked-by-me' ? person.id : null,
            onRefused
        }),
        [person, standing, name, offline, unblocking, unblockPerson, onRefused]
    )

    return (
        <ShellPage
            title={name}
            subtitle={gone ? undefined : (person.username ?? undefined)}
            leading={
                <PersonAvatar
                    person={person}
                    presence={showsPresence(standing) ? dm.presence : null}
                    dot={8}
                    className='size-6'
                    initialClassName='text-micro'
                    iconClassName='size-3.5'
                />
            }
            composer={standing === 'open'}
            bodyClassName='flex flex-col overflow-y-hidden'
            overlay={
                <Suspense fallback={null}>
                    <ChatDropZone channelId={dm.id} channelName={name} dm permissions={permissions} />
                </Suspense>
            }
            actions={
                <WithTooltip label={t('dm.pins')} side='bottom'>
                    <IconButton ref={pinsButton} label={t('dm.pins')} on={pins.open} onClick={pins.toggle}>
                        <Pin />
                    </IconButton>
                </WithTooltip>
            }
            panel={
                <RightPanel state={pins} buttonRef={pinsButton} title={t('dm.pins')}>
                    <Suspense fallback={<PageLoader className='min-h-0 py-6' />}>
                        <PinsPanel channelId={dm.id} manage onOpen={openPinned} channel={links.channel} />
                    </Suspense>
                </RightPanel>
            }
        >
            <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                <ChannelChat
                    channelId={dm.id}
                    channelName={name}
                    permissions={permissions}
                    linkTo={linkTo}
                    readLink={links.readLink}
                    mentions={mentions}
                    target={target}
                    dm={parts}
                />
            </Suspense>
        </ShellPage>
    )
}

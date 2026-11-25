import { useCallback, useContext, useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Crown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/servers'
import '@/i18n/social'
import { Tag } from '@/components/settings/SettingsRow'
import { ShellContext } from '@/components/shell/shell-context'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipWhenCut } from '@/components/ui/tooltip'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { getApiErrorType } from '@/lib/api-error'
import { useAuthStore } from '@/features/auth'
import {
    ActivityBlock,
    activityShown,
    ConfirmRelationshipDialog,
    isGone,
    PersonAvatar,
    ProfileActions,
    relationshipWith,
    useMessagePerson,
    usePersonMoves,
    usePersonProfile,
    useRelationships,
    type ConfirmKind,
    type PersonProfile,
    type SocialPerson
} from '@/features/social'
import { settingsCache, USERS_PATHS, type ProfileCardProps } from '@/features/users'
import { useEndTimeout } from '../../api/useModeration'
import { useServerMember } from '../../api/useRoles'
import { useServers } from '../../api/useServers'
import { useChatLinks } from '../../hooks/useChatLinks'
import { blockedOn, heldRoles, tableDate } from '../../lib/moderation'
import { profileModeration, sharedServers, type ProfileModeration } from '../../lib/profile-card'
import type { Server, ServerMember } from '../../types'
import { ModerationDialogFor } from '../settings/members/ModerationDialogs'

/** Avatar 56 (S-CHAT-05): inline, one use, kept out of the main stylesheet. */
const AVATAR_56 = { width: 56, height: 56 }

/**
 * The profile popover's body (02 S-CHAT-05, D-252, D-253), in
 * `ProfilePopover`, which `ProfileTrigger` (users) opens: avatar 56
 * with its dot, the name (`headline` 600) and username, their study
 * activity (the DM panel's block, not on oneself nor someone blocked), the
 * bio; in a server their roles as Tags (the owner's first, with a crown) and
 * "Member since"; outside one, or for someone no longer in it, the servers
 * we share (three, then "+N more"). Then "Message", where we stand and ⋯
 * (the DM panel's row), a moderator's items in ⋯ (04 S-SET-03); "Edit
 * profile" on oneself; nothing more for a deleted account.
 *
 * Read each time it opens: the profile, and in a server the member; where
 * we stand from my relationships (live), the activity patched live
 * (D-252). A question (Block, Unfriend) or a moderation dialog takes the
 * popover's place (`handOff`).
 */
export function ProfileCard({ userId, serverId, name, avatarUrl, close, handOff }: ProfileCardProps) {
    const { t } = useTranslation('servers')
    const { t: ts } = useTranslation('social')
    const profile = usePersonProfile(userId)
    const member = useServerMember(serverId, userId)
    const server = useServers().data?.find((one) => one.id === serverId)
    const me = useAuthStore((state) => state.user?.id)
    const gone = getApiErrorType(profile.error) === 'NOT_FOUND_ERROR' || (profile.data && isGone(profile.data.user))
    const person: SocialPerson = profile.data?.user ?? { id: userId, username: null, displayName: name, avatarUrl }
    const shownName = gone ? t('profile.deleted') : (person.displayName ?? person.username ?? name)
    // In a server once the member is read; NOT_FOUND (they left) as outside it (D-252).
    const inServer = serverId !== null && server && member.data ? { server, member: member.data } : null
    const memberFailed =
        serverId !== null && member.isError && getApiErrorType(member.error) !== 'NOT_FOUND_ERROR' && !member.data
    const reading = profile.isPending || (serverId !== null && member.isPending)
    // Where we stand, live (D-242): a friend's dot from my relationships, kept live; none on someone
    // I blocked, as their DM shows none (showsPresence); else as last read with the profile.
    const standing = useRelationships().data?.find((entry) => entry.user.id === userId)
    const presence =
        standing?.type === 'blocked'
            ? null
            : (standing?.presence ?? inServer?.member.status ?? profile.data?.presence ?? null)

    if (gone) {
        return (
            <div className='flex items-center gap-3'>
                <PersonAvatar
                    person={{ id: userId, username: null, displayName: null, avatarUrl: null }}
                    className=''
                    style={AVATAR_56}
                    initialClassName='text-title-2'
                    iconClassName='size-6'
                />
                <p className='text-headline font-semibold text-text-primary'>{shownName}</p>
            </div>
        )
    }

    return (
        <>
            <Head person={person} name={shownName} presence={presence} />
            {reading ? (
                <div className='flex flex-col gap-2' aria-hidden='true'>
                    <Skeleton className='h-4 w-full' />
                    <Skeleton className='h-4 w-40' />
                    <Skeleton className='h-8 w-40 rounded-badge' />
                </div>
            ) : profile.data && !memberFailed ? (
                <Body
                    profile={profile.data}
                    person={person}
                    name={shownName}
                    presence={presence}
                    self={userId === me}
                    inServer={inServer}
                    close={close}
                    handOff={handOff}
                />
            ) : (
                <p className='flex flex-wrap items-center gap-x-2 text-body-sm text-text-secondary'>
                    {ts('profile.failed')}
                    <Button
                        size='sm'
                        variant='text'
                        className='px-1'
                        onClick={() => void (memberFailed ? member.refetch() : profile.refetch())}
                    >
                        {ts('profile.tryAgain')}
                    </Button>
                </p>
            )}
        </>
    )
}

/** Avatar 56 with its dot (C-03 L), the name and the username. */
function Head({ person, name, presence }: { person: SocialPerson; name: string; presence: PersonProfile['presence'] }) {
    return (
        <div className='flex min-w-0 items-center gap-3'>
            <PersonAvatar
                person={person}
                presence={presence}
                className=''
                style={AVATAR_56}
                initialClassName='text-title-2'
                dot={14}
                cutout='ring-surface-1'
                dotClassName='bottom-0 right-0'
            />
            <div className='flex min-w-0 flex-col gap-0.5'>
                <h2 className='break-words text-headline font-semibold text-text-primary'>{name}</h2>
                {person.username ? <p className='truncate text-label text-text-tertiary'>{person.username}</p> : null}
            </div>
        </div>
    )
}

function Body({
    profile,
    person,
    name,
    presence,
    self,
    inServer,
    close,
    handOff
}: {
    profile: PersonProfile
    person: SocialPerson
    name: string
    presence: PersonProfile['presence']
    self: boolean
    inServer: { server: Server; member: ServerMember } | null
    close: () => void
    handOff: ProfileCardProps['handOff']
}) {
    const relationship = relationshipWith(useRelationships().data, person.id)
    const shown = activityShown(presence, !self && relationship !== 'blocked')
    return (
        <>
            <ActivityBlock userId={person.id} activity={shown ? profile.activity : null} />
            {profile.bio ? (
                <p style={{ whiteSpace: 'pre-line' }} className='break-words text-body-sm text-text-primary'>
                    {profile.bio}
                </p>
            ) : null}
            {inServer ? <InServer {...inServer} /> : <Shared servers={profile.mutualServers} close={close} />}
            {self ? (
                <EditProfile close={close} />
            ) : relationship === null ? (
                // My relationships not read yet: no "Add friend" to someone who may be a friend.
                <Skeleton className='h-8 w-40 rounded-badge' aria-hidden='true' />
            ) : (
                <Actions
                    person={person}
                    name={name}
                    relationship={relationship}
                    inServer={inServer}
                    close={close}
                    handOff={handOff}
                />
            )}
        </>
    )
}

/** Their roles as Tags (C-36), the owner's first with a crown, then "Member since" on its own line. */
function InServer({ server, member }: { server: Server; member: ServerMember }) {
    const { t, i18n } = useTranslation('servers')
    const timeZone = useQuery(settingsCache).data?.timezone
    const roles = heldRoles(member, server.roles)
    return (
        <>
            {member.isOwner || roles.length > 0 ? (
                <ul aria-label={t('profile.roles')} className='flex flex-wrap gap-1'>
                    {member.isOwner ? (
                        <li>
                            <Tag className='gap-1'>
                                <Crown className='size-3' aria-hidden='true' />
                                {t('members.owner')}
                            </Tag>
                        </li>
                    ) : null}
                    {roles.map((role) => (
                        // A name longer than the popover is cut, whole in a Tooltip (inline: one use).
                        <li key={role.id} style={{ maxWidth: '100%' }} className='min-w-0'>
                            <Tag className='w-full'>
                                <TooltipWhenCut label={role.name}>
                                    <span className='min-w-0 truncate'>{role.name}</span>
                                </TooltipWhenCut>
                            </Tag>
                        </li>
                    ))}
                </ul>
            ) : null}
            <p className='text-label text-text-tertiary'>
                {t('profile.memberSince', { date: tableDate(new Date(member.joinedAt), i18n.language, timeZone) })}
            </p>
        </>
    )
}

/** "SERVER CHUNG — N" (D-111): three servers, squircle 24 and name, each opening it; then "+N more". */
function Shared({ servers, close }: { servers: PersonProfile['mutualServers']; close: () => void }) {
    const { t } = useTranslation('servers')
    const { t: ts } = useTranslation('social')
    const links = useChatLinks()
    const titleId = useId()
    const { shown, more } = sharedServers(servers)
    if (servers.length === 0) return <p className='text-body-sm text-text-secondary'>{ts('profile.noShared')}</p>
    return (
        <section aria-labelledby={titleId} className='flex flex-col gap-1'>
            <h3 id={titleId} className='text-label font-semibold uppercase text-text-tertiary'>
                {ts('profile.shared', { count: servers.length })}
            </h3>
            <ul className='flex flex-col'>
                {shown.map((shared) => {
                    const server = links.server(shared.id, shared.name)
                    return (
                        <li key={shared.id}>
                            <Link
                                to={server.path}
                                onClick={close}
                                className='flex h-8 items-center gap-2 rounded-input px-1 transition-colors duration-micro hover:bg-surface-2'
                            >
                                {server.iconUrl ? (
                                    <img
                                        src={server.iconUrl}
                                        alt=''
                                        className='size-6 shrink-0 rounded-server object-cover'
                                    />
                                ) : (
                                    <span
                                        aria-hidden='true'
                                        className='flex size-6 shrink-0 items-center justify-center rounded-server bg-surface-2 text-micro font-semibold text-text-primary'
                                    >
                                        {server.initials}
                                    </span>
                                )}
                                <span className='min-w-0 truncate text-body-sm text-text-secondary'>{server.name}</span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
            {more > 0 ? (
                <p className='px-1 text-label text-text-tertiary'>{t('profile.moreServers', { count: more })}</p>
            ) : null}
        </section>
    )
}

/** On oneself (`self`): "Edit profile" to 10 S-ME-02, no "Message". */
function EditProfile({ close }: { close: () => void }) {
    const { t } = useTranslation('servers')
    return (
        <div className='flex'>
            <Button asChild size='sm' variant='outline'>
                <Link to={USERS_PATHS.profile} onClick={close}>
                    {t('profile.edit')}
                </Link>
            </Button>
        </div>
    )
}

const MODERATION_WORDS = {
    timeout: 'members.menu.timeout',
    changeTimeout: 'members.menu.changeTimeout',
    endTimeout: 'members.menu.endTimeout',
    kick: 'members.menu.kick',
    ban: 'members.menu.ban'
} as const satisfies Record<ProfileModeration, string>

/**
 * "Message" (not to someone blocked), then the DM panel's row: where we
 * stand and ⋯, with a moderator's items in a server. Message, a server's
 * link close the popover; a question or a dialog takes its place.
 */
function Actions({
    person,
    name,
    relationship,
    inServer,
    close,
    handOff
}: {
    person: SocialPerson
    name: string
    relationship: NonNullable<ReturnType<typeof relationshipWith>>
    inServer: { server: Server; member: ServerMember } | null
    close: () => void
    handOff: ProfileCardProps['handOff']
}) {
    const { t } = useTranslation('servers')
    const offline = useContext(ShellContext)?.connection === 'offline'
    const { message, opening } = useMessagePerson()
    const now = useMinuteClock()
    const endTimeout = useEndTimeout(inServer?.server.id ?? '')
    const ask = useCallback(
        (kind: ConfirmKind) =>
            handOff(
                <ConfirmRelationshipDialog kind={kind} userId={person.id} name={name} onClose={() => handOff(null)} />
            ),
        [handOff, person.id, name]
    )
    const moves = usePersonMoves(person, name, ask)
    const items = inServer ? profileModeration(inServer.server, inServer.member, now) : []

    const moderate = (item: ProfileModeration) => {
        if (!inServer) return
        const { server, member } = inServer
        if (item === 'endTimeout') {
            endTimeout.mutate({ userId: member.userId, name })
            return
        }
        handOff(
            <LiveModerationDialog
                kind={item === 'changeTimeout' ? 'timeout' : item}
                server={server}
                member={member}
                onClose={() => handOff(null)}
            />
        )
    }

    return (
        <ProfileActions
            person={person}
            name={name}
            relationship={relationship}
            offline={offline}
            moves={moves}
            lead={
                relationship === 'blocked' ? null : (
                    <Button
                        size='sm'
                        disabled={opening}
                        aria-busy={opening || undefined}
                        onClick={() => {
                            message(person.id)
                            close()
                        }}
                    >
                        {t('profile.message')}
                    </Button>
                )
            }
            moderation={
                items.length > 0
                    ? items.map((item) => (
                          <DropdownMenuItem
                              key={item}
                              disabled={offline}
                              onSelect={() => moderate(item)}
                              className={item === 'kick' || item === 'ban' ? 'text-danger' : undefined}
                          >
                              {t(MODERATION_WORDS[item])}
                          </DropdownMenuItem>
                      ))
                    : undefined
            }
        />
    )
}

/**
 * A moderation dialog from the popover, on the member as last read (the
 * Members page's `actingOn`): one who came to outrank the moderator
 * meanwhile stops it at once (04 SET-EDGE `target-outranked`).
 */
function LiveModerationDialog({
    kind,
    server,
    member,
    onClose
}: {
    kind: 'timeout' | 'kick' | 'ban'
    server: Server
    member: ServerMember
    onClose: () => void
}) {
    const now = useServerMember(server.id, member.userId).data ?? member
    const viewer = useServers().data?.find((one) => one.id === server.id) ?? server
    return (
        <ModerationDialogFor
            kind={kind}
            serverId={server.id}
            member={now}
            blocked={blockedOn(viewer, now, kind)}
            onClose={onClose}
        />
    )
}

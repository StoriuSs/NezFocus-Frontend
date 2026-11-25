import { useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Copy, Ellipsis, Send, UserCheck, UserPlus, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { WithTooltip } from '@/components/ui/tooltip'
import { usePersonProfile } from '../api/usePersonProfile'
import type { Activity } from '../lib/activity-line'
import type { ChatLinks } from '../lib/chat-links'
import { isGone } from '../lib/dm-chat'
import { profileAction, profileMenu } from '../lib/dm-profile'
import type { Presence, RelationshipType, SocialPerson } from '../types'
import { ActivityBlock } from './ActivityLine'
import { Gated } from './Gated'
import { PersonAvatar } from './PersonAvatar'

/**
 * What one can do about someone from their DM (C-50 and the `not-friend`
 * strip, D-251): the page's, which says how each went (a Toast) and asks
 * before unfriending or blocking. `busy` while one is on its way.
 */
export interface PersonMoves {
    request: () => void
    accept: () => void
    decline: () => void
    cancel: () => void
    unblock: () => void
    unfriend: () => void
    block: () => void
    copyUsername: () => void
    busy: boolean
}

const TAG_ICON = { friend: UserCheck, outgoing: Send, blocked: Ban } as const

/**
 * The profile panel of a DM (C-50, D-109, D-251), in the RightPanel's body:
 * avatar 80 with its dot when the Header shows one, the name (`title-2`
 * 600) and the username, the bio, where we stand (a Tag, or "Add friend" /
 * "Accept", then ⋯: Copy username · unfriend, cancel, decline or unblock ·
 * Block), a line, then the servers we share, each opening the server.
 * A deleted account: its avatar and "Deleted account", nothing else.
 *
 * Name, avatar and dot come from the DM (live); where we stand from my
 * relationships (live); the bio and the servers from the profile, read
 * again each time the panel shows. The study activity block under the name,
 * live as the Header's line (S-CHAT-05 › Khối hoạt động, D-252).
 */
export function DmProfile({
    person,
    name,
    presence,
    activity,
    relationship,
    offline,
    moves,
    links
}: {
    person: SocialPerson
    name: string
    presence: Presence | null
    /** What they study now, null where the Header shows none. */
    activity: Activity | null
    relationship: RelationshipType | null
    offline: boolean
    moves: PersonMoves
    links: ChatLinks
}) {
    const gone = isGone(person)
    return (
        <div className='flex flex-col gap-3'>
            {/* In a row: stretched across the column, its dot would sit at the panel's edge. */}
            <div className='flex'>
                <PersonAvatar
                    person={person}
                    presence={presence}
                    className='size-20'
                    initialClassName='text-title-1'
                    iconClassName='size-9'
                    dot={14}
                    cutout='ring-surface-1'
                    dotClassName='bottom-0.5 right-0.5'
                />
            </div>
            <div className='flex min-w-0 flex-col gap-0.5'>
                <h3 className='break-words text-title-2 font-semibold text-text-primary'>{name}</h3>
                {gone || !person.username ? null : (
                    <p className='truncate text-label text-text-tertiary'>{person.username}</p>
                )}
            </div>
            {gone ? null : <ActivityBlock userId={person.id} activity={activity} />}
            {gone ? null : (
                <ProfileBody
                    person={person}
                    name={name}
                    relationship={relationship}
                    offline={offline}
                    moves={moves}
                    links={links}
                />
            )}
        </div>
    )
}

function ProfileBody({
    person,
    name,
    relationship,
    offline,
    moves,
    links
}: {
    person: SocialPerson
    name: string
    relationship: RelationshipType | null
    offline: boolean
    moves: PersonMoves
    links: ChatLinks
}) {
    const { t } = useTranslation('social')
    const profile = usePersonProfile(person.id)
    const serversId = useId()
    const servers = profile.data?.mutualServers ?? []

    return (
        <>
            {profile.data?.bio ? (
                <p className='whitespace-pre-line break-words text-body-sm text-text-primary'>{profile.data.bio}</p>
            ) : null}
            {relationship === null ? (
                // My relationships not read yet: no "Add friend" to someone who may be a friend.
                <Skeleton className='h-8 w-32 rounded-badge' aria-hidden='true' />
            ) : (
                <ProfileActions
                    person={person}
                    name={name}
                    relationship={relationship}
                    offline={offline}
                    moves={moves}
                />
            )}
            <hr className='border-border' />
            <section aria-labelledby={serversId} className='flex flex-col gap-2'>
                <h3 id={serversId} className='text-label font-semibold uppercase text-text-tertiary'>
                    {servers.length > 0 ? t('profile.shared', { count: servers.length }) : t('profile.sharedNone')}
                </h3>
                {profile.isPending ? (
                    <div className='flex flex-col gap-0.5' aria-hidden='true'>
                        <Skeleton className='h-10 rounded-input' />
                        <Skeleton className='h-10 rounded-input' />
                    </div>
                ) : profile.isError && !profile.data ? (
                    <p className='flex flex-wrap items-center gap-x-2 text-body-sm text-text-secondary'>
                        {t('profile.failed')}
                        <Button size='sm' variant='text' className='px-1' onClick={() => void profile.refetch()}>
                            {t('profile.tryAgain')}
                        </Button>
                    </p>
                ) : servers.length === 0 ? (
                    <p className='text-body-sm text-text-secondary'>{t('profile.noShared')}</p>
                ) : (
                    <ul className='flex flex-col gap-0.5'>
                        {servers.map((shared) => {
                            const server = links.server(shared.id, shared.name)
                            return (
                                <li key={shared.id}>
                                    <Link
                                        to={server.path}
                                        title={server.name}
                                        className='flex h-10 items-center gap-2.5 rounded-input px-1 transition-colors duration-micro hover:bg-surface-2'
                                    >
                                        {server.iconUrl ? (
                                            <img
                                                src={server.iconUrl}
                                                alt=''
                                                className='size-8 shrink-0 rounded-server object-cover'
                                            />
                                        ) : (
                                            <span
                                                aria-hidden='true'
                                                className='flex size-8 shrink-0 items-center justify-center rounded-server bg-surface-2 text-label font-semibold text-text-primary'
                                            >
                                                {server.initials}
                                            </span>
                                        )}
                                        <span className='min-w-0 truncate text-body-sm font-medium text-text-secondary'>
                                            {server.name}
                                        </span>
                                    </Link>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>
        </>
    )
}

/**
 * Where we stand and ⋯ (C-50, D-110). The button pressed turns into a Tag
 * (or the other way round): the focus, left on nothing, goes to ⋯.
 */
function ProfileActions({
    person,
    name,
    relationship,
    offline,
    moves
}: {
    person: SocialPerson
    name: string
    relationship: RelationshipType
    offline: boolean
    moves: PersonMoves
}) {
    const { t } = useTranslation('social')
    const action = profileAction(relationship)
    const menu = profileMenu(relationship)
    const off = offline || moves.busy
    const more = useRef<HTMLButtonElement>(null)
    const shown = 'tag' in action ? action.tag : action.button
    const was = useRef(shown)
    useEffect(() => {
        if (was.current === shown) return
        was.current = shown
        const focused = document.activeElement
        if (!focused || focused === document.body) more.current?.focus()
    }, [shown])
    const undo = menu.undo
        ? {
              unfriend: { label: t('friends.unfriend'), run: moves.unfriend },
              cancel: { label: t('friends.cancel'), run: moves.cancel },
              decline: { label: t('friends.decline'), run: moves.decline },
              unblock: { label: t('friends.unblock'), run: moves.unblock }
          }[menu.undo]
        : null

    return (
        <div className='flex items-center gap-2'>
            {'tag' in action ? (
                <Tag kind={action.tag} label={t(`profile.${action.tag}`)} />
            ) : (
                <Gated offline={offline}>
                    <Button
                        size='sm'
                        variant='outline'
                        disabled={off}
                        aria-busy={moves.busy || undefined}
                        onClick={action.button === 'request' ? moves.request : moves.accept}
                    >
                        {action.button === 'request' ? (
                            <UserPlus aria-hidden='true' />
                        ) : (
                            <UserCheck aria-hidden='true' />
                        )}
                        {t(`profile.${action.button}`)}
                    </Button>
                </Gated>
            )}
            <DropdownMenu>
                <WithTooltip label={t('profile.more')}>
                    <DropdownMenuTrigger asChild>
                        <IconButton
                            ref={more}
                            label={`${t('profile.more')}: ${name}`}
                            className='rounded-button border border-border-input'
                        >
                            <Ellipsis />
                        </IconButton>
                    </DropdownMenuTrigger>
                </WithTooltip>
                <DropdownMenuContent align='end'>
                    <DropdownMenuItem disabled={!person.username} onSelect={moves.copyUsername}>
                        <Copy aria-hidden='true' />
                        {t('profile.copyUsername')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {undo ? (
                        <DropdownMenuItem disabled={off} onSelect={undo.run}>
                            <UserX aria-hidden='true' />
                            {undo.label}
                        </DropdownMenuItem>
                    ) : null}
                    {menu.block ? (
                        <DropdownMenuItem
                            disabled={off}
                            onSelect={moves.block}
                            className='text-danger focus:text-danger'
                        >
                            <Ban aria-hidden='true' />
                            {t('friends.block')}
                        </DropdownMenuItem>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}

/** Where we stand, not a button (D-110 R13): as high as the buttons beside it, on `surface-2`, icon 14. */
function Tag({ kind, label }: { kind: keyof typeof TAG_ICON; label: string }) {
    const Icon = TAG_ICON[kind]
    return (
        <span className='inline-flex h-8 items-center gap-1.5 rounded-badge bg-surface-2 px-3 text-label font-medium text-text-secondary'>
            <Icon className='size-3.5 shrink-0' aria-hidden='true' />
            {label}
        </span>
    )
}

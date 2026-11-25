import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePersonProfile } from '../api/usePersonProfile'
import type { PersonMoves } from '../hooks/usePersonMoves'
import type { Activity } from '../lib/activity-line'
import type { ChatLinks } from '../lib/chat-links'
import { isGone } from '../lib/dm-chat'
import type { Presence, RelationshipType, SocialPerson } from '../types'
import { ActivityBlock } from './ActivityLine'
import { PersonAvatar } from './PersonAvatar'
import { ProfileActions } from './ProfileActions'

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

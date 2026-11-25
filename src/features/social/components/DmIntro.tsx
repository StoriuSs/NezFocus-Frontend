import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { isGone } from '../lib/dm-chat'
import { nameOf } from '../lib/friends-list'
import type { SocialPerson } from '../types'
import { PersonAvatar } from './PersonAvatar'

/**
 * A DM's beginning (C-10 `ChannelIntro` `dm`, S-DM-03 R1): avatar 80, the
 * name (`title-1` 700), the username 4 under it, then "This is the beginning
 * of your conversation with {name}." 8 under; no servers in common (the
 * profile panel has them, D-109), no mascot. An account deleted: the
 * `deleted` avatar, "Deleted account", "…with this account".
 */
export function DmIntro({ person }: { person: SocialPerson }) {
    const { t } = useTranslation('social')
    const gone = isGone(person)
    const name = nameOf(person) ?? t('dm.deleted')
    return (
        <section className='flex flex-col items-start px-4 pb-2 pt-4'>
            <PersonAvatar person={person} className='size-20' initialClassName='text-title-1' iconClassName='size-10' />
            <h2 className='mt-2 text-title-1 font-bold text-text-primary'>{name}</h2>
            {gone || !person.username ? null : <p className='mt-1 text-body text-text-secondary'>{person.username}</p>}
            <p className='mt-2 text-body text-text-secondary'>{gone ? t('dm.introGone') : t('dm.intro', { name })}</p>
        </section>
    )
}

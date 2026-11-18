import { Link } from 'react-router-dom'
import { Mic, MonitorUp, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { useProfile } from '@/features/users'
import { LISTED_PEOPLE, personName, useOrderedPeople, type RoomPerson } from '@/features/voice'

/**
 * Who is in a voice room, under its row in the channel list (C-06 `occupied`,
 * D-205): avatar 20, the name (`label` 500 `text-secondary`), then what they
 * have on, in a fixed order: sharing · camera · mic (`text-tertiary` 14).
 * Oneself first, then as C-06 orders them; up to 10, then "+N more", which
 * opens the room's page (not unfolded in place).
 */
export function RoomPeople({ people, to }: { people: RoomPerson[]; to: string }) {
    const { t } = useTranslation()
    const ordered = useOrderedPeople(people, useProfile().data?.id)
    const shown = ordered.slice(0, LISTED_PEOPLE)
    const more = ordered.length - shown.length
    return (
        <ul className='flex flex-col'>
            {shown.map(({ user, micOn, cameraOn, screenSharing }) => {
                const name = personName(user) ?? t('shell.voice.deletedAccount')
                const states = [
                    screenSharing && t('shell.voice.sharing'),
                    cameraOn && t('shell.voice.cameraOn'),
                    micOn && t('shell.voice.micOn')
                ].filter(Boolean)
                return (
                    <li
                        key={user.id}
                        aria-label={[name, ...states].join(', ')}
                        className='flex h-7 items-center gap-2 pl-[30px] pr-2 text-label font-medium text-text-secondary [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-text-tertiary'
                    >
                        <Avatar className='size-5'>
                            <AvatarImage src={user.avatarUrl ?? undefined} alt='' className='object-cover' />
                            <AvatarFallback className='bg-surface-3 text-micro font-semibold text-text-primary'>
                                <AvatarInitial name={user.displayName ?? user.username} />
                            </AvatarFallback>
                        </Avatar>
                        <span className='min-w-0 flex-1 truncate' aria-hidden='true'>
                            {name}
                        </span>
                        {screenSharing ? <MonitorUp aria-hidden='true' /> : null}
                        {cameraOn ? <Video aria-hidden='true' /> : null}
                        {micOn ? <Mic aria-hidden='true' /> : null}
                    </li>
                )
            })}
            {more > 0 ? (
                <li>
                    <Link
                        to={to}
                        className='flex h-7 items-center rounded-input pl-[30px] pr-2 text-label font-medium text-text-tertiary hover:bg-surface-2 hover:text-text-secondary'
                    >
                        {t('shell.voice.morePeople', { count: more })}
                    </Link>
                </li>
            ) : null}
        </ul>
    )
}

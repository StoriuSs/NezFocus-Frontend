import type { ReactNode } from 'react'
import { EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/tasks'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { PresenceDot, type Presence } from '@/components/ui/presence-dot'
import { WithTooltip } from '@/components/ui/tooltip'
import { ProfileTrigger } from '@/features/users'
import { cn } from '@/lib/utils'
import { nameOf } from '../lib/people'

/**
 * Someone a task names in its detail (C-13 MemberRow `username`, 05
 * S-TASK-02): avatar with its presence, the name ("An (bạn)" for oneself,
 * "Minh (đã rời server)" for a creator gone, without presence), the username
 * under it, and "Mất quyền xem kênh" beside it for one still on the task who
 * no longer views the channel (D-194). What one may do on the row goes last.
 * The avatar and the names open their profile in the task's server
 * (`serverId`; 05 S-TASK-02 › Đi tới, D-253): one gone from it shows as
 * outside the server.
 */
export function PersonRow({
    person,
    serverId,
    me,
    presence,
    leftServer = false,
    lostAccess = false,
    children
}: {
    person: { id: string; username: string | null; displayName: string | null; avatarUrl: string | null }
    serverId: string
    me: string | undefined
    presence?: Presence
    leftServer?: boolean
    lostAccess?: boolean
    children?: ReactNode
}) {
    const { t } = useTranslation('tasks')
    const name = nameOf(person, t('people.deleted'))
    const shown = person.id === me ? t('detail.you', { name }) : leftServer ? t('detail.leftServer', { name }) : name
    return (
        <div className='flex min-h-10 items-center gap-3'>
            {/* The button as wide as what it shows: the popover hangs beside the name, not the row's end. */}
            <span className='flex min-w-0 flex-1'>
                <ProfileTrigger
                    userId={person.id}
                    serverId={serverId}
                    name={name}
                    avatarUrl={person.avatarUrl}
                    className='flex min-w-0 items-center gap-3 rounded-input'
                >
                    <span className='relative shrink-0'>
                        <Avatar className='size-8'>
                            <AvatarImage src={person.avatarUrl ?? undefined} alt='' className='object-cover' />
                            <AvatarFallback
                                className={cn(
                                    'text-label font-semibold',
                                    person.id === me ? 'bg-primary text-on-primary' : 'bg-surface-3 text-text-primary'
                                )}
                            >
                                <AvatarInitial name={person.displayName ?? person.username} />
                            </AvatarFallback>
                        </Avatar>
                        {presence && !leftServer ? (
                            <PresenceDot presence={presence} className='absolute -bottom-0.5 -right-0.5' />
                        ) : null}
                    </span>
                    <span className='grid min-w-0 flex-1'>
                        <span className='truncate text-body-sm text-text-primary'>{shown}</span>
                        <span className='flex min-w-0 items-center gap-2 text-label'>
                            {person.username ? (
                                <span className='truncate text-text-tertiary'>{person.username}</span>
                            ) : null}
                            {lostAccess ? (
                                <WithTooltip label={t('detail.lostAccessHint', { name })}>
                                    <span className='flex shrink-0 items-center gap-1 text-danger'>
                                        <EyeOff className='size-3.5' aria-hidden='true' />
                                        {t('detail.lostAccess')}
                                    </span>
                                </WithTooltip>
                            ) : null}
                        </span>
                    </span>
                </ProfileTrigger>
            </span>
            {children}
        </div>
    )
}

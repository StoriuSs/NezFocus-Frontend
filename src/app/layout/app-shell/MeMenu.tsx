import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Pencil, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { PresenceDot, type Presence } from '@/components/ui/presence-dot'
import { AUTH_PATHS, useAuthStore } from '@/features/auth'
import { useProfile } from '@/features/users/api/useProfile'
import { useAvatarErrorRefresh } from '@/features/users/hooks/useAvatarErrorRefresh'
import { USERS_PATHS } from '@/features/users'

/** The four statuses you can choose (AUTH-07), and the dot each shows. */
const STATUSES = ['online', 'idle', 'dnd', 'invisible'] as const
type Status = (typeof STATUSES)[number]
const DOT: Record<Status, Presence> = { online: 'online', idle: 'idle', dnd: 'dnd', invisible: 'offline' }

/** Your avatar: the picture, or your initial on `primary` (C-03: your own avatar). */
function MyAvatar({ name, url, onError }: { name: string; url?: string | null; onError: () => void }) {
    return (
        <Avatar className='size-10'>
            <AvatarImage
                src={url ?? undefined}
                alt=''
                className='object-cover'
                onLoadingStatusChange={(status) => status === 'error' && onError()}
            />
            <AvatarFallback className='bg-primary text-body font-semibold text-on-primary'>
                {name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
        </Avatar>
    )
}

/**
 * Your menu (S-ME-01), from your avatar at the foot of the rail: who you are
 * (opens your profile), your status, Settings, Sign out.
 *
 * M0: the status is chosen here and shown on your avatar, in this tab only;
 * it reaches other people when presence is built.
 */
export function MeMenu() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const logout = useAuthStore((state) => state.logout)
    const authUser = useAuthStore((state) => state.user)
    const { data: profile } = useProfile(true)
    const [status, setStatus] = useState<Status>('online')

    const name = profile?.displayName || profile?.username || authUser?.username || authUser?.email || ''
    const username = profile?.username || authUser?.username
    const refreshAvatar = useAvatarErrorRefresh(profile?.avatarUrl)
    const statusName = t(`shell.me.status.${status}.name`)

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                aria-label={t('shell.me.trigger', { name, status: statusName })}
                className='relative mt-2 rounded-full'
            >
                <MyAvatar name={name} url={profile?.avatarUrl} onError={refreshAvatar} />
                <PresenceDot presence={DOT[status]} cutout='ring-bg' className='absolute -bottom-0.5 -right-0.5' />
            </DropdownMenuTrigger>
            <DropdownMenuContent side='right' align='end' sideOffset={12} className='w-[280px]'>
                <DropdownMenuItem
                    onSelect={() => navigate(USERS_PATHS.profile)}
                    aria-label={t('shell.me.profile', { name })}
                    className='group items-start gap-3 p-2'
                >
                    <span className='relative'>
                        <MyAvatar name={name} url={profile?.avatarUrl} onError={refreshAvatar} />
                        <PresenceDot
                            presence={DOT[status]}
                            cutout='ring-surface-1 group-focus:ring-surface-2'
                            className='absolute -bottom-0.5 -right-0.5'
                        />
                    </span>
                    <span className='min-w-0 flex-1'>
                        <span className='block truncate text-headline text-text-primary'>{name}</span>
                        {username ? (
                            <span className='block truncate text-label text-text-secondary'>{username}</span>
                        ) : null}
                        {profile?.bio ? (
                            <span className='line-clamp-2 text-label text-text-tertiary'>{profile.bio}</span>
                        ) : null}
                    </span>
                    <Pencil className='mt-1 !size-3.5 text-text-secondary opacity-0 group-hover:opacity-100 group-focus:opacity-100' />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <PresenceDot presence={DOT[status]} />
                        {statusName}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent sideOffset={4} className='w-[284px]'>
                        <DropdownMenuRadioGroup value={status} onValueChange={(value) => setStatus(value as Status)}>
                            {STATUSES.map((option) => (
                                <DropdownMenuRadioItem key={option} value={option} className='items-start'>
                                    <PresenceDot presence={DOT[option]} className='mt-[5px]' />
                                    <span>
                                        <span className='block text-body-sm text-text-primary'>
                                            {t(`shell.me.status.${option}.name`)}
                                        </span>
                                        {option !== 'online' ? (
                                            <span className='block text-label text-text-secondary'>
                                                {t(`shell.me.status.${option}.detail`)}
                                            </span>
                                        ) : null}
                                    </span>
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate(AUTH_PATHS.settings)}>
                    <Settings className='text-text-secondary' />
                    {t('shell.me.settings')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout()} className='text-danger'>
                    <LogOut />
                    {t('shell.me.signOut')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { SettingsGroup, Tag } from '@/components/settings/SettingsRow'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '@/features/auth/api/useSessions'
import { deviceName, lastActiveLabel } from '@/features/auth/lib/session-label'
import type { SessionInfo } from '@/features/auth/types'
import { useQuery } from '@tanstack/react-query'
import { userKeys, type UserSettings } from '@/features/users'

const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, mobile: Smartphone } as const

/** How long the list may take before its placeholder rows show (10-settings › S-ME-03). */
const SKELETON_AFTER_MS = 1000

/**
 * "Sessions" on the account page (S-ME-03, REQ-AUTH-03, D-75): every
 * signed-in device, this one first. Any other can be signed out at once, with
 * no question; "Sign out the other devices" asks first and keeps this one.
 */
export function SessionsSection() {
    const { t } = useTranslation('auth')
    const sessions = useSessions()
    const list = sessions.data?.sessions

    return (
        <SettingsGroup id='sessions' title={t('settings.sessions.title')}>
            {list ? (
                <>
                    <ul className='flex flex-col'>
                        {list.map((session) => (
                            <SessionRow key={session.id} session={session} />
                        ))}
                    </ul>
                    {list.length > 1 ? (
                        <SignOutOthers count={list.length - 1} />
                    ) : (
                        <p className='py-2 text-body-sm text-text-secondary'>{t('settings.sessions.onlyThis')}</p>
                    )}
                </>
            ) : sessions.isError ? (
                <div className='flex items-center gap-3 py-2' role='alert'>
                    <p className='text-body-sm text-text-secondary'>{t('settings.sessions.loadFailed')}</p>
                    <Button variant='text' size='sm' onClick={() => void sessions.refetch()}>
                        {t('settings.sessions.retry')}
                    </Button>
                </div>
            ) : (
                <SessionsLoading />
            )}
        </SettingsGroup>
    )
}

/** Nothing for a second, then three placeholder rows: a quick answer never flashes them. */
function SessionsLoading() {
    const { t } = useTranslation('auth')
    const [slow, setSlow] = useState(false)
    useEffect(() => {
        const timer = setTimeout(() => setSlow(true), SKELETON_AFTER_MS)
        return () => clearTimeout(timer)
    }, [])
    return (
        <div role='status' aria-busy='true' aria-label={t('settings.sessions.loading')}>
            {slow
                ? [0, 1, 2].map((row) => (
                      <div key={row} className='flex items-center gap-3 py-2'>
                          <Skeleton className='size-5 rounded-badge' />
                          <div className='flex-1 space-y-1.5'>
                              <Skeleton className='h-3.5 w-48' />
                              <Skeleton className='h-3 w-64' />
                          </div>
                      </div>
                  ))
                : null}
        </div>
    )
}

function SessionRow({ session }: { session: SessionInfo }) {
    const { t } = useTranslation('auth')
    const now = useMinuteClock()
    // Read only: the AppShell loads the account's settings as the app opens.
    const timeZone = useQuery<UserSettings>({ queryKey: userKeys.settings(), enabled: false }).data?.timezone
    const revoke = useRevokeSession()
    const name = deviceName(session, t)
    const Icon = DEVICE_ICONS[session.device] ?? Monitor
    const when = session.current
        ? t('settings.sessions.active')
        : lastActiveLabel(new Date(session.lastActiveAt), now, t, timeZone)

    async function signOut() {
        await revoke.mutateAsync(session.id)
        toast.success(t('settings.sessions.signedOut', { device: name }))
    }

    return (
        <li className='flex items-center gap-3 py-2'>
            <Icon className='size-5 shrink-0 text-text-secondary' aria-hidden='true' />
            <div className='min-w-0 flex-1'>
                <div className='flex min-w-0 items-center gap-2'>
                    <span className='truncate text-body-sm font-semibold text-text-primary'>{name}</span>
                    {session.current ? <Tag>{t('settings.sessions.thisDevice')}</Tag> : null}
                </div>
                <p className='text-label text-text-secondary'>
                    {session.ip ? `${when} · ${t('settings.sessions.ip', { ip: session.ip })}` : when}
                </p>
            </div>
            {session.current ? null : (
                <Button
                    variant='text'
                    size='sm'
                    className='text-danger'
                    aria-label={t('settings.sessions.signOutDevice', { device: name })}
                    disabled={revoke.isPending}
                    // A failure is a toast (the query client's default); the row stays.
                    onClick={() => void signOut().catch(() => undefined)}
                >
                    {t('settings.sessions.signOut')}
                </Button>
            )}
        </li>
    )
}

function SignOutOthers({ count }: { count: number }) {
    const { t } = useTranslation('auth')
    const [open, setOpen] = useState(false)
    const revokeOthers = useRevokeOtherSessions()

    async function confirm() {
        const revoked = await revokeOthers.mutateAsync()
        setOpen(false)
        toast.success(t('settings.sessions.signedOutOthers', { count: revoked }))
    }

    return (
        <div className='py-2'>
            <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
                {t('settings.sessions.signOutOthers')}
            </Button>
            <Dialog open={open} onOpenChange={(next) => !revokeOthers.isPending && setOpen(next)}>
                <DialogContent className='sm:max-w-dialog'>
                    <DialogHeader>
                        <DialogTitle>{t('settings.sessions.confirmTitle', { count })}</DialogTitle>
                        <DialogDescription>{t('settings.sessions.confirmText')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className='mt-2'>
                        <Button variant='text' disabled={revokeOthers.isPending} onClick={() => setOpen(false)}>
                            {t('settings.sessions.cancel')}
                        </Button>
                        <Button
                            variant='destructive'
                            disabled={revokeOthers.isPending}
                            onClick={() => void confirm().catch(() => undefined)}
                        >
                            {t('settings.sessions.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

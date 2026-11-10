import '@/i18n/servers'
import { useEffect } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AUTH_PATHS, useAuthStore } from '@/features/auth'
import { useInvitePreview } from '../api/useInvites'
import { InviteCard } from '../components/invites/InviteCard'
import { InviteNotice } from '../components/invites/InviteNotice'
import { inviteProblem } from '../components/invites/invite-problem'
import { useInviteDialogs } from '../invite-dialogs.store'

/**
 * The query that carries an invite through signing up or in (01 › Lời mời
 * đang chờ): `invite` is the code, for the banner and for coming back; a
 * link's `?channel=` rides in `next`, back to this page.
 */
function inviteFlow(code: string, channel: string | null): string {
    const query = new URLSearchParams({ invite: code })
    if (channel) query.set('next', `/invite/${code}?${new URLSearchParams({ channel })}`)
    return query.toString()
}

/** Signed in: the app, on the Study page (D-124), with the invite dialog over it. */
function OpenInApp({ code, channel }: { code: string; channel: string | null }) {
    const showJoin = useInviteDialogs((state) => state.showJoin)
    useEffect(() => showJoin(code, channel), [code, channel, showJoin])
    return <Navigate to='/study' replace />
}

/**
 * `/invite/{code}` (S-SRV-03, D-81, Q16). A visitor sees the invite in the
 * AuthShell and goes on to make an account or sign in, the invite going
 * along; someone signed in is taken into the app with the dialog; an account
 * not finished yet finishes first, keeping the invite.
 */
export default function InvitePage() {
    const { code = '' } = useParams()
    const [params] = useSearchParams()
    const channel = params.get('channel')
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const isComplete = useAuthStore((state) => state.isComplete)

    if (isAuthenticated && !isComplete)
        return <Navigate to={`${AUTH_PATHS.welcome}?${inviteFlow(code, channel)}`} replace />
    if (isAuthenticated) return <OpenInApp code={code} channel={channel} />
    return <GuestInvite code={code} channel={channel} />
}

function GuestInvite({ code, channel }: { code: string; channel: string | null }) {
    const { t } = useTranslation('servers')
    const preview = useInvitePreview(code, channel)
    const flow = inviteFlow(code, channel)
    const problem = preview.isError ? inviteProblem(preview.error) : null

    useEffect(() => {
        const before = document.title
        if (preview.data) document.title = t('join.tab', { server: preview.data.server.name })
        else if (problem?.kind === 'invalid') document.title = t('join.tabExpired')
        return () => {
            document.title = before
        }
    }, [preview.data, problem?.kind, t])

    if (problem) {
        return (
            <InviteNotice
                problem={problem}
                heading={(text) => <h1 className='text-title-1 font-semibold text-text-primary'>{text}</h1>}
                actions={(canRetry) =>
                    problem.kind === 'invalid' ? (
                        <>
                            <Button asChild variant='secondary'>
                                <Link to={AUTH_PATHS.register}>{t('join.expiredRegister')}</Link>
                            </Button>
                            <Button asChild variant='text'>
                                <Link to={AUTH_PATHS.signIn}>{t('join.signIn')}</Link>
                            </Button>
                        </>
                    ) : (
                        <Button type='button' disabled={!canRetry} onClick={() => void preview.refetch()}>
                            {t('join.retry')}
                        </Button>
                    )
                }
            />
        )
    }

    if (!preview.data) {
        return (
            <div className='grid gap-6' aria-busy='true'>
                <Skeleton className='h-8 w-56' />
                <div className='flex items-center gap-4 rounded-button border border-border bg-surface-1 p-4'>
                    <Skeleton className='size-[72px] rounded-[33%]' />
                    <div className='grid flex-1 gap-2'>
                        <Skeleton className='h-5 w-48' />
                        <Skeleton className='h-4 w-28' />
                    </div>
                </div>
                <Button disabled>{t('join.register')}</Button>
                <Button disabled variant='secondary'>
                    {t('join.signIn')}
                </Button>
            </div>
        )
    }

    const { inviterName } = preview.data
    return (
        <div className='grid gap-6'>
            <h1 className='text-title-1 font-semibold text-text-primary'>
                {inviterName ? t('join.title', { name: inviterName }) : t('join.titleAnonymous')}
            </h1>
            <InviteCard preview={preview.data} />
            <div className='grid gap-3'>
                <Button asChild>
                    <Link to={`${AUTH_PATHS.register}?${flow}`}>{t('join.register')}</Link>
                </Button>
                <Button asChild variant='secondary'>
                    <Link to={`${AUTH_PATHS.signIn}?${flow}`}>{t('join.signIn')}</Link>
                </Button>
            </div>
        </div>
    )
}

import '@/i18n/servers'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useInvitePreview } from '../../api/useInvites'
import { useServers } from '../../api/useServers'
import { useInviteDialogs } from '../../invite-dialogs.store'
import { inviteProblem, toastName } from '../../lib/invite-problem'
import { channelAfterJoin, InviteJoin } from './InviteJoin'
import { InviteNotice } from './InviteNotice'

/**
 * An invite opened while signed in (S-SRV-03 `signed-in`, D-81): a dialog
 * over the page they are on, so a study room keeps running beneath. A member
 * of that server gets no dialog: the server opens, with "You're already in …"
 * (`already-member`, SRV-04).
 */
export default function JoinInviteDialog() {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const join = useInviteDialogs((state) => state.join)
    const hide = useInviteDialogs((state) => state.hideJoin)
    const servers = useServers()
    const preview = useInvitePreview(join?.code ?? null, join?.channel ?? null)
    const [expired, setExpired] = useState(false)

    const mine = preview.data ? servers.data?.find((server) => server.id === preview.data.server.id) : undefined
    useEffect(() => {
        if (!mine || !join) return
        toast(t('join.alreadyMember', { server: toastName(mine.name) }))
        void navigate(channelAfterJoin(mine, join.channel), { replace: true })
        hide()
    }, [mine, join, navigate, hide, t])

    if (!join || mine) return null
    const problem = expired ? { kind: 'invalid' as const } : preview.isError ? inviteProblem(preview.error) : null

    return (
        <Dialog open onOpenChange={(open) => !open && hide()}>
            <DialogContent
                className='sm:max-w-dialog'
                aria-describedby={undefined}
                // "Join" takes the focus itself once the invite is shown.
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
                {problem ? (
                    <InviteNotice
                        problem={problem}
                        heading={(text) => <DialogTitle>{text}</DialogTitle>}
                        actions={(canRetry) => (
                            <>
                                {problem.kind !== 'invalid' ? (
                                    <Button type='button' disabled={!canRetry} onClick={() => void preview.refetch()}>
                                        {t('join.retry')}
                                    </Button>
                                ) : null}
                                <Button type='button' variant='secondary' onClick={hide}>
                                    {t('join.close')}
                                </Button>
                            </>
                        )}
                    />
                ) : preview.data ? (
                    <InviteJoin
                        code={join.code}
                        channel={join.channel}
                        preview={preview.data}
                        dismissLabel={t('join.later')}
                        onDismiss={hide}
                        onInvalid={() => setExpired(true)}
                        onJoined={hide}
                    />
                ) : (
                    <div className='grid gap-4' aria-busy='true'>
                        <DialogTitle className='sr-only'>{t('join.titleAnonymous')}</DialogTitle>
                        <Skeleton className='h-7 w-48' />
                        <div className='flex items-center gap-4 rounded-button border border-border bg-surface-2 p-4'>
                            <Skeleton className='size-[72px] rounded-[33%]' />
                            <div className='grid flex-1 gap-2'>
                                <Skeleton className='h-5 w-48' />
                                <Skeleton className='h-4 w-28' />
                            </div>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

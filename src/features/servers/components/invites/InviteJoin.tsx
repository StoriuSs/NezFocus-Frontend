import '@/i18n/servers'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { FormMessage } from '@/components/form/FormMessage'
import { Button } from '@/components/ui/button'
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { WithTooltip } from '@/components/ui/tooltip'
import { useAcceptInvite } from '../../api/useInvites'
import { useServers } from '../../api/useServers'
import { inviteProblem, toastName, type InviteProblem } from '../../lib/invite-problem'
import { channelPath } from '../../lib/paths'
import { MAX_SERVERS } from '../../lib/server-name'
import type { InvitePreview, Server } from '../../types'
import { InviteCard } from './InviteCard'

/** Where joining lands: the link's channel when they now see it, else the server (its first text channel, 02). */
export function channelAfterJoin(server: Server, channel: string | null): string {
    const target = channel && server.channels.some((candidate) => candidate.id === channel) ? channel : undefined
    return channelPath(server.id, target)
}

/**
 * The invite seen while signed in (S-SRV-03 `signed-in`, and S-SRV-01
 * `join-preview`): who invites, the InviteCard, then "Join". Joined, the URL
 * is replaced by the server's channel, so Back does not return to the invite
 * (Q16); no toast, the "X joined the server" message is enough (M2).
 *
 * In 100 servers already, it says so before (the client knows the count);
 * banned, it is only learned on joining (Q14) and leaves just "Close"; a
 * link that ran out meanwhile goes to `onInvalid` (the expired notice).
 */
export function InviteJoin({
    code,
    channel,
    preview,
    dismissLabel,
    onDismiss,
    onInvalid,
    onJoined
}: {
    code: string
    channel: string | null
    preview: InvitePreview
    dismissLabel: string
    onDismiss: () => void
    onInvalid: () => void
    onJoined: () => void
}) {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const servers = useServers()
    const accept = useAcceptInvite()
    const [problem, setProblem] = useState<InviteProblem | null>(null)
    const full = (servers.data?.length ?? 0) >= MAX_SERVERS
    const banned = problem?.kind === 'banned'
    const joinButtonRef = useRef<HTMLButtonElement>(null)
    // Focus on "Join" (S-SRV-03 `signed-in`): Enter joins, Esc is "Not now".
    useEffect(() => joinButtonRef.current?.focus(), [])

    function join() {
        setProblem(null)
        accept.mutate(code, {
            onSuccess: ({ server, joined }) => {
                if (!joined) toast(t('join.alreadyMember', { server: toastName(server.name) }))
                void navigate(channelAfterJoin(server, channel), { replace: true })
                onJoined()
            },
            onError: (error) => {
                const found = inviteProblem(error)
                if (found.kind === 'invalid') onInvalid()
                else setProblem(found)
            }
        })
    }

    const message = full ? (
        <FormMessage tone='neutral'>{t('create.maxServers')}</FormMessage>
    ) : problem?.kind === 'banned' ? (
        <FormMessage tone='danger'>{t('join.banned', { server: preview.server.name })}</FormMessage>
    ) : problem?.kind === 'maxServers' ? (
        <FormMessage tone='neutral'>{t('create.maxServers')}</FormMessage>
    ) : problem?.kind === 'offline' ? (
        <FormMessage tone='danger' icon='wifi-off'>
            {t('join.offline')}
        </FormMessage>
    ) : problem ? (
        <FormMessage tone='danger'>{t('join.failed')}</FormMessage>
    ) : null

    const joinButton = (
        <Button ref={joinButtonRef} type='button' disabled={full || accept.isPending} onClick={join}>
            {accept.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
            {t('join.join')}
        </Button>
    )

    return (
        <div className='grid gap-4'>
            <DialogHeader>
                <DialogTitle>
                    {preview.inviterName ? t('join.title', { name: preview.inviterName }) : t('join.titleAnonymous')}
                </DialogTitle>
            </DialogHeader>
            <InviteCard preview={preview} inDialog />
            {message}
            <DialogFooter>
                {banned ? (
                    <Button type='button' variant='secondary' onClick={onDismiss}>
                        {t('join.close')}
                    </Button>
                ) : (
                    <>
                        <Button type='button' variant='text' disabled={accept.isPending} onClick={onDismiss}>
                            {dismissLabel}
                        </Button>
                        {full ? <WithTooltip label={t('create.maxServers')}>{joinButton}</WithTooltip> : joinButton}
                    </>
                )}
            </DialogFooter>
        </div>
    )
}

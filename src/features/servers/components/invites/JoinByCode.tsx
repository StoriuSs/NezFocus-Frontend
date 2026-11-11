import '@/i18n/servers'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatWait } from '@/features/auth'
import { useLookUpInvite } from '../../api/useInvites'
import { useServers } from '../../api/useServers'
import { inviteProblem, type InviteProblem } from '../../lib/invite-problem'
import { toastName } from '../../lib/server-name'
import { parseInviteInput } from '../../lib/invites'
import type { InvitePreview } from '../../types'
import { channelAfterJoin, InviteJoin } from './InviteJoin'

/** "← Back", the first row of a sub-step (C-34). */
function Back({ onClick, label }: { onClick: () => void; label: string }) {
    // In a div: a grid would stretch the button across.
    return (
        <div>
            <Button type='button' variant='text' size='sm' className='-ml-3' onClick={onClick}>
                <ArrowLeft aria-hidden='true' />
                {label}
            </Button>
        </div>
    )
}

type Found = { code: string; channel: string | null; preview: InvitePreview }

/**
 * "Join with an invite code" (S-SRV-01 `join-by-code` → `join-preview`): the
 * code or a whole link, looked up on "Continue", then the invite as S-SRV-03
 * shows it. A code of a server they are in closes the dialog and opens it,
 * as S-SRV-03 `already-member`.
 */
export function JoinByCode({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const servers = useServers()
    const lookUpInvite = useLookUpInvite()
    const [text, setText] = useState('')
    const [problem, setProblem] = useState<'malformed' | InviteProblem | null>(null)
    const [looking, setLooking] = useState(false)
    const [found, setFound] = useState<Found | null>(null)
    const input = useRef<HTMLInputElement>(null)
    // Focus in the field (S-SRV-01 `join-by-code`), and back in it after "Back" from the invite.
    useEffect(() => {
        if (!found) input.current?.focus()
    }, [found])

    async function lookUp(event: FormEvent) {
        event.preventDefault()
        if (looking) return
        const parsed = parseInviteInput(text)
        if (!parsed) return setProblem('malformed')
        setProblem(null)
        setLooking(true)
        try {
            const preview = await lookUpInvite(parsed.code, parsed.channel)
            const mine = servers.data?.find((server) => server.id === preview.server.id)
            if (mine) {
                toast(t('join.alreadyMember', { server: toastName(mine.name) }))
                void navigate(channelAfterJoin(mine, parsed.channel))
                onClose()
                return
            }
            setFound({ ...parsed, preview })
        } catch (error) {
            setProblem(inviteProblem(error))
        } finally {
            setLooking(false)
        }
    }

    if (found) {
        return (
            <div className='grid gap-2'>
                <Back onClick={() => setFound(null)} label={t('byCode.back')} />
                <InviteJoin
                    code={found.code}
                    channel={found.channel}
                    preview={found.preview}
                    dismissLabel={t('byCode.cancel')}
                    onDismiss={onClose}
                    onInvalid={() => {
                        setFound(null)
                        setProblem({ kind: 'invalid' })
                    }}
                    onJoined={onClose}
                />
            </div>
        )
    }

    const fieldError =
        problem === 'malformed'
            ? t('byCode.malformed')
            : problem?.kind === 'invalid'
              ? t('byCode.invalid')
              : problem?.kind === 'offline'
                ? t('byCode.offline')
                : undefined

    return (
        <form onSubmit={(event) => void lookUp(event)} className='grid gap-4' noValidate>
            <Back onClick={onBack} label={t('byCode.back')} />
            <DialogHeader>
                <DialogTitle>{t('byCode.title')}</DialogTitle>
                <DialogDescription>{t('byCode.description')}</DialogDescription>
            </DialogHeader>
            <FormField label={t('byCode.label')} error={fieldError}>
                {(field) => (
                    <Input
                        {...field}
                        ref={input}
                        value={text}
                        readOnly={looking}
                        placeholder={t('byCode.placeholder')}
                        autoComplete='off'
                        spellCheck={false}
                        onChange={(event) => {
                            setText(event.target.value)
                            if (problem === 'malformed' || problem?.kind === 'invalid') setProblem(null)
                        }}
                    />
                )}
            </FormField>
            {problem !== null && problem !== 'malformed' && problem.kind === 'limited' ? (
                <FormMessage tone='neutral' icon='clock'>
                    {t('byCode.limited', { wait: formatWait(problem.waitSeconds) })} {t('byCode.sharedNetwork')}
                </FormMessage>
            ) : null}
            {problem !== null && problem !== 'malformed' && problem.kind === 'failed' ? (
                <FormMessage tone='danger'>{t('join.failed')}</FormMessage>
            ) : null}
            <DialogFooter>
                <Button type='button' variant='text' disabled={looking} onClick={onClose}>
                    {t('byCode.cancel')}
                </Button>
                <Button type='submit' disabled={looking}>
                    {looking ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                    {t('byCode.next')}
                </Button>
            </DialogFooter>
        </form>
    )
}

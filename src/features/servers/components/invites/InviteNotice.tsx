import '@/i18n/servers'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, CloudOff, Link2Off } from 'lucide-react'
import { formatWait } from '@/features/auth'
import type { InviteProblem } from '../../lib/invite-problem'

/** Seconds left of a wait, counting down to 0. */
export function useSecondsLeft(seconds: number): number {
    const [left, setLeft] = useState(seconds)
    useEffect(() => {
        setLeft(seconds)
        const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000)
        return () => clearInterval(timer)
    }, [seconds])
    return left
}

/**
 * An invite that cannot be shown (S-SRV-03): no longer valid (`expired`),
 * too many opened from this network (counting down), or not loaded. Same
 * layout for each, centred: icon 48, title, one line, then the actions.
 * `heading` renders the title, as a dialog's title or the page's h1.
 */
export function InviteNotice({
    problem,
    heading,
    actions
}: {
    problem: InviteProblem
    heading: (text: string) => ReactNode
    /** Given whether a retry may be offered yet (a limit not waited out: no). */
    actions: (canRetry: boolean) => ReactNode
}) {
    const { t } = useTranslation('servers')
    const left = useSecondsLeft(problem.kind === 'limited' ? problem.waitSeconds : 0)

    const [Icon, title, body] =
        problem.kind === 'invalid'
            ? [Link2Off, t('join.expiredTitle'), t('join.expiredBody')]
            : problem.kind === 'limited'
              ? [Clock, t('join.limitedTitle'), t('join.limitedBody', { wait: formatWait(left) })]
              : [CloudOff, t('join.loadFailedTitle'), t('join.loadFailedBody')]

    return (
        <div className='flex flex-col items-center gap-3 text-center'>
            <Icon className='size-12 text-text-tertiary' aria-hidden='true' />
            {heading(title)}
            <p className='text-body text-text-secondary'>{body}</p>
            <div className='mt-4 flex w-full flex-col gap-2'>{actions(problem.kind !== 'limited' || left === 0)}</div>
        </div>
    )
}

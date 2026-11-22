import { useRef, type ReactNode } from 'react'
import { Loader2, SkipForward, SlidersHorizontal, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useSessionCommand } from '../api/useSessionCommands'
import { cycleName } from '../lib/cycle-words'
import { nextPhaseOf, sessionCycle } from '../lib/phases'
import type { AnySession } from '../types'

/**
 * The Host's controls (07 S-ROOM-04, Popover "Điều khiển", 280, above its
 * button): skip the phase (no asking, the room sees who did it), change the
 * cycle (only while paused, D-21), and stop the session for the room, which
 * asks first. Someone who manages study rooms but is not the Host reads
 * who is (`moderator`). The menu takes the focus on its first row.
 */
export function SessionMenu({
    session,
    me,
    hostName,
    people,
    onSkip,
    onChangeCycle,
    onStop,
    children
}: {
    session: AnySession
    me: string
    hostName: string | null
    /** Everyone in the room, oneself in. */
    people: number
    /** Skips the phase (sent, or held while syncing again). */
    onSkip: () => void
    onChangeCycle: () => void
    onStop: () => void
    /** The "Điều khiển" button. */
    children: ReactNode
}) {
    const { t } = useTranslation('study')
    const paused = session.status === 'paused'
    const afterClose = useRef<(() => void) | null>(null)
    const row = (title: string, detail: string) => (
        <span className='flex min-w-0 flex-col'>
            <span>{title}</span>
            <span className='text-label text-text-secondary'>{detail}</span>
        </span>
    )
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
            <DropdownMenuContent
                side='top'
                align='center'
                sideOffset={8}
                className='w-[280px]'
                onCloseAutoFocus={(event) => {
                    const then = afterClose.current
                    if (!then) return
                    afterClose.current = null
                    event.preventDefault()
                    then()
                }}
            >
                {session.hostId !== me ? (
                    <DropdownMenuLabel className='text-label font-normal text-text-secondary'>
                        {hostName ? t('menu.moderator', { name: hostName }) : t('menu.moderatorNoHost')}
                    </DropdownMenuLabel>
                ) : null}
                <DropdownMenuItem onSelect={onSkip}>
                    <SkipForward />
                    {row(t('menu.skip'), t(`menu.skipTo.${nextPhaseOf(session)}`))}
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={!paused}
                    onSelect={() => {
                        afterClose.current = onChangeCycle
                    }}
                >
                    <SlidersHorizontal />
                    {row(
                        t('menu.changeCycle'),
                        paused
                            ? t('menu.currentCycle', { cycle: cycleName(t, sessionCycle(session)) })
                            : t('menu.pauseToChange')
                    )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className='text-danger focus:text-danger'
                    onSelect={() => {
                        afterClose.current = onStop
                    }}
                >
                    <Square />
                    {row(t('menu.stop'), people > 1 ? t('menu.stopFor', { count: people }) : t('menu.stopAlone'))}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

/**
 * Stopping for the whole room asks first (07 S-ROOM-04 `stop-confirm`,
 * C-14 `simple`): the focus on Cancel; nothing closes it while it is sent.
 */
export function StopSessionDialog({
    session,
    people,
    onClose
}: {
    session: AnySession
    people: number
    onClose: () => void
}) {
    const { t } = useTranslation('study')
    const stop = useSessionCommand(session)
    return (
        <Dialog open onOpenChange={(open) => !open && !stop.isPending && onClose()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>{people > 1 ? t('stop.title', { count: people }) : t('stop.titleAlone')}</DialogTitle>
                    <DialogDescription>{t('stop.body')}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type='button' variant='text' disabled={stop.isPending} onClick={onClose}>
                        {t('stop.cancel')}
                    </Button>
                    <Button
                        type='button'
                        variant='destructive'
                        aria-busy={stop.isPending || undefined}
                        onClick={() => {
                            if (!stop.isPending) stop.mutate('stop', { onSuccess: onClose })
                        }}
                    >
                        {stop.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('stop.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

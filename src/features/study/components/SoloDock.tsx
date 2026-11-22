import { Link } from 'react-router-dom'
import { Pause, Play, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import '../study.css'
import { DOCK_BUTTON, DockFrame, dockLinkClass, type DockShape } from '@/components/shell/DockFrame'
import { PhaseTag } from '@/components/shell/PhaseTag'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSoloCommand } from '../api/useSolo'
import { SOLO_PATH } from '../api/useSoloSession'
import { useSessionClock } from '../hooks/useSessionClock'
import { clockText, remainingMs } from '../lib/phases'
import { sessionLineText } from '../lib/phase-words'
import { waitLeftMs } from '../lib/solo'
import type { FocusSession } from '../types'

/**
 * One's Solo away from its page (InRoomDock `solo` / `solo-waiting`, C-09,
 * 08 S-STUDY-01 `solo-running`, `solo-waiting`): its phase and what is left
 * counting each second, then "Học một mình"; Tạm dừng / Tiếp tục, then Dừng
 * apart at the right (no Mic or Camera: a Solo has no voice). Its break
 * over: "Hết giờ nghỉ", "Còn 08:12 để học tiếp" and "Học tiếp". The words
 * open the Solo page. Dừng asks nothing (REQ-STUDY-05); its toast is the
 * shell's (`SoloWatch`). Under a room's dock when both show (D-103, Q7).
 * Not here yet: the floating window button (M7).
 */
export default function SoloDock({ session, shape }: { session: FocusSession; shape: DockShape }) {
    const { t } = useTranslation('study')
    const { t: tShell } = useTranslation()
    const now = useSessionClock(session)
    const command = useSoloCommand(session)
    const waiting = session.status === 'waiting'
    const paused = session.status === 'paused'
    const send = (next: 'pause' | 'resume' | 'stop' | 'continue') => {
        if (!command.isPending) command.mutate(next)
    }
    return (
        <DockFrame shape={shape} label={t('dock.label')}>
            {(focused) => (
                <>
                    {/* The minutes for a screen reader, only while the focus is in the dock (C-09 › Accessibility). */}
                    <span className='sr-only' aria-live={focused ? 'polite' : 'off'}>
                        {sessionLineText(tShell, session, now)}
                    </span>
                    <WithTooltip label={t('dock.open')}>
                        <Link to={SOLO_PATH} aria-label={t('dock.open')} className={dockLinkClass(shape)}>
                            <span
                                className={cn(
                                    'flex items-center gap-2 text-body-sm',
                                    shape === 'column' && 'justify-between'
                                )}
                            >
                                <PhaseTag phase={session.phase} paused={paused} waiting={waiting} />
                                {waiting ? null : (
                                    <span
                                        aria-hidden='true'
                                        className={cn(
                                            'shrink-0 font-numeric text-numeric-inline tabular-nums',
                                            paused ? 'text-text-secondary' : 'text-text-primary'
                                        )}
                                    >
                                        {clockText(remainingMs(session, now))}
                                    </span>
                                )}
                            </span>
                            <span className='truncate text-label font-semibold text-text-secondary'>
                                {waiting
                                    ? t('dock.waitLeft', { clock: clockText(waitLeftMs(session, now)) })
                                    : t('solo.title')}
                            </span>
                        </Link>
                    </WithTooltip>
                    <div className={cn('flex items-center gap-1', shape === 'column' && 'px-1.5')}>
                        {waiting ? (
                            <Button type='button' size='sm' onClick={() => send('continue')}>
                                {t('dock.continue')}
                            </Button>
                        ) : (
                            <>
                                <WithTooltip label={paused ? t('dock.resume') : t('dock.pause')}>
                                    <IconButton
                                        label={paused ? t('dock.resume') : t('dock.pause')}
                                        className={DOCK_BUTTON}
                                        onClick={() => send(paused ? 'resume' : 'pause')}
                                    >
                                        {paused ? <Play /> : <Pause />}
                                    </IconButton>
                                </WithTooltip>
                                {shape === 'column' ? <span className='flex-1' /> : null}
                                <WithTooltip label={t('dock.stop')}>
                                    <IconButton
                                        label={t('dock.stop')}
                                        className={DOCK_BUTTON}
                                        onClick={() => send('stop')}
                                    >
                                        <Square />
                                    </IconButton>
                                </WithTooltip>
                            </>
                        )}
                    </div>
                </>
            )}
        </DockFrame>
    )
}

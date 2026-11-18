import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import '../voice.css'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { useToastEdge } from '@/hooks/useToastArea'
import { cn } from '@/lib/utils'
import { useLeaveRoom } from '../hooks/useLeaveRoom'
import { switchMic } from '../lib/session'
import type { VoiceRoom } from '../types'
import { useVoiceStore } from '../voice.store'

// IconButton `filled` (C-02): `surface-3`; hover the overlay of a pressed button, there being no step above it.
const BUTTON =
    'size-8 bg-surface-3 text-text-primary hover:bg-surface-3 hover:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] hover:text-text-primary'

/**
 * The bar that keeps the room at hand away from its page (InRoomDock `voice`,
 * C-09, S-ROOM-06 `voice-only`): "In a room" (`+reconnecting`: "Reconnecting…"),
 * the room's name · how many people; Mic, then Leave apart at the right
 * (the Camera comes with L3b). The words open the room's page, with a
 * Tooltip "Open {room}". `column`:
 * the bottom of the channel list, 240 wide (≥ 1024); `strip`: a 52-high band
 * at the bottom of the window (below 1024), toasts kept above it (C-16).
 *
 * Not on the page of the room itself (C-09): the caller leaves it out there.
 */
export default function InRoomDock({
    room,
    to,
    shape
}: {
    room: Pick<VoiceRoom, 'serverId' | 'channelId' | 'name' | 'canSpeak'> & { count: number }
    /** The room's page. */
    to: string
    shape: 'column' | 'strip'
}) {
    const { t } = useTranslation('voice')
    const phase = useVoiceStore((state) => state.call?.phase)
    const mic = useVoiceStore((state) => state.mic)
    const leave = useLeaveRoom(room)
    const strip = useRef<HTMLDivElement>(null)
    useToastEdge('barTop', strip, shape === 'strip')
    const micHint = !room.canSpeak
        ? t('controls.noSpeak')
        : mic === 'blocked'
          ? t('controls.micBlocked')
          : t(mic === 'on' ? 'controls.micOff' : 'controls.micOn')
    const micUsable = room.canSpeak && mic !== 'blocked'
    const sub = phase === 'reconnecting' ? t('dock.reconnecting') : t('dock.people', { count: room.count })

    return (
        <section
            ref={strip}
            aria-label={t('dock.inRoom')}
            className={cn(
                'flex shrink-0 border-t bg-surface-2',
                shape === 'column' ? 'mt-auto flex-col gap-1.5 px-1.5 pb-3 pt-2' : 'h-[52px] items-center gap-3 px-4'
            )}
        >
            <WithTooltip label={t('dock.open', { room: room.name })}>
                <Link
                    to={to}
                    className={cn(
                        'flex min-w-0 rounded-input px-1.5 py-1 hover:bg-surface-3',
                        shape === 'column' ? 'flex-col gap-1' : 'flex-1 items-center gap-2'
                    )}
                >
                    <span className='flex items-center gap-1.5 text-body-sm font-semibold text-text-primary'>
                        <Volume2 className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                        {t('dock.inRoom')}
                    </span>
                    <span className='flex min-w-0 gap-1 text-label'>
                        <span className='truncate font-semibold text-text-secondary'>{room.name}</span>
                        <span className='shrink-0 font-medium text-text-tertiary'>· {sub}</span>
                    </span>
                </Link>
            </WithTooltip>
            <div className={cn('flex items-center gap-1', shape === 'column' && 'px-1.5')}>
                <WithTooltip label={micHint}>
                    <IconButton
                        label={micHint}
                        aria-disabled={micUsable ? undefined : true}
                        className={cn(BUTTON, !micUsable && 'text-text-tertiary')}
                        onClick={micUsable ? () => void switchMic(mic !== 'on') : undefined}
                    >
                        {micUsable && mic === 'on' ? <Mic /> : <MicOff />}
                    </IconButton>
                </WithTooltip>
                {shape === 'column' ? <span className='flex-1' /> : null}
                <WithTooltip label={t('controls.leave')}>
                    <IconButton label={t('controls.leave')} className={BUTTON} onClick={leave}>
                        <PhoneOff />
                    </IconButton>
                </WithTooltip>
            </div>
        </section>
    )
}

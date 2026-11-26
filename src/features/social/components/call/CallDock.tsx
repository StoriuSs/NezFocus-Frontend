import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { DOCK_BUTTON as BUTTON, DockFrame, dockLinkClass, type DockShape } from '@/components/shell/DockFrame'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { serverNow } from '@/lib/server-clock'
import { cn } from '@/lib/utils'
import { useCallStore, type TabCall } from '../../call.store'
import { callClock } from '../../lib/call-result'
import { hangUp, switchCallCamera, switchCallMic } from '../../lib/call-session'
import { nameOf } from '../../lib/friends-list'
import { dmPath } from '../../lib/paths'
import { DANGER } from './call-tones'

/**
 * The dock of this tab's call (InRoomDock `call`, C-09, 09 S-CALL-01
 * `minimized`): `phone` · their name · the call's clock counting each second
 * (from the answer); "Cuộc gọi thoại" / "Cuộc gọi video" ("Đang gọi…" ringing
 * out, "Đang kết nối…", "Đang kết nối lại…"); Mic · Camera · then Kết thúc
 * (`danger`) apart at the right. The words open the call's page (the DM),
 * with a Tooltip "Mở cuộc gọi với {Chi}". Its frame is the shell's
 * DockFrame, over the Solo's when both show (`call` + `solo`). Not on the
 * call's own page (`CallDockSlot`).
 */
export default function CallDock({ tab, shape }: { tab: TabCall; shape: DockShape }) {
    const { t } = useTranslation('social')
    const mic = useCallStore((state) => state.mic)
    const camera = useCallStore((state) => state.camera)
    const { call, phase } = tab
    const name = nameOf(call.user) ?? ''
    const kind = t(call.video ? 'call.videoKind' : 'call.voiceKind')
    const sub =
        phase === 'calling'
            ? t(call.video ? 'call.callingVideo' : 'call.calling')
            : phase === 'joining'
              ? t('call.connecting')
              : phase === 'reconnecting'
                ? t('call.reconnecting')
                : kind
    const micHint = mic === 'blocked' ? t('call.micBlocked') : t(mic === 'on' ? 'call.micOff' : 'call.micOn')
    const cameraHint =
        camera === 'blocked' ? t('call.cameraBlocked') : t(camera === 'on' ? 'call.cameraOff' : 'call.cameraOn')
    const endLabel = t(phase === 'calling' ? 'call.cancelHint' : 'call.endHint')
    const strip = shape === 'strip'

    return (
        <DockFrame shape={shape} label={t('call.dock.region')}>
            <WithTooltip label={t('call.dock.open', { name })}>
                <Link to={dmPath(call.dmId)} aria-label={`${name}, ${sub}`} className={dockLinkClass(shape)}>
                    <span className={cn('flex min-w-0 items-center gap-1.5 text-body-sm', !strip && 'justify-between')}>
                        <span className='flex min-w-0 items-center gap-1.5 font-semibold text-text-primary'>
                            <Phone className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                            <span className='truncate'>{name}</span>
                        </span>
                        {phase === 'connected' && call.acceptedAt ? <DockClock since={call.acceptedAt} /> : null}
                    </span>
                    <span className='truncate text-label font-medium text-text-tertiary'>{sub}</span>
                </Link>
            </WithTooltip>
            <div className={cn('flex items-center gap-1', shape === 'column' && 'px-1.5')}>
                <WithTooltip label={micHint}>
                    <IconButton
                        label={micHint}
                        aria-disabled={mic === 'blocked' ? true : undefined}
                        className={cn(BUTTON, mic === 'blocked' && 'text-text-tertiary')}
                        onClick={mic === 'blocked' ? undefined : () => void switchCallMic(mic !== 'on')}
                    >
                        {mic === 'on' ? <Mic /> : <MicOff />}
                    </IconButton>
                </WithTooltip>
                <WithTooltip label={cameraHint}>
                    <IconButton
                        label={cameraHint}
                        aria-disabled={camera === 'blocked' ? true : undefined}
                        className={cn(BUTTON, camera === 'blocked' && 'text-text-tertiary')}
                        onClick={camera === 'blocked' ? undefined : () => void switchCallCamera(camera !== 'on')}
                    >
                        {camera === 'on' ? <Video /> : <VideoOff />}
                    </IconButton>
                </WithTooltip>
                {shape === 'column' ? <span className='flex-1' /> : null}
                <WithTooltip label={endLabel}>
                    {/* The danger End (C-09 `call`: the one semantic colour of a dock). */}
                    <IconButton label={endLabel} className={BUTTON} style={DANGER} onClick={() => void hangUp()}>
                        <PhoneOff />
                    </IconButton>
                </WithTooltip>
            </div>
        </DockFrame>
    )
}

/** The call's clock in the dock (`numeric-inline` 16, `tabular-nums`, `text-primary`), each second. */
function DockClock({ since }: { since: string }) {
    const [now, setNow] = useState(serverNow)
    useEffect(() => {
        const timer = setInterval(() => setNow(serverNow()), 1000)
        return () => clearInterval(timer)
    }, [])
    return (
        <span aria-hidden='true' className='shrink-0 font-numeric text-numeric-inline tabular-nums text-text-primary'>
            {callClock(now - Date.parse(since))}
        </span>
    )
}

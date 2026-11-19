import { forwardRef } from 'react'
import { MonitorUp, MonitorX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { canShareScreen } from '../lib/share'
import { switchScreen } from '../lib/session'
import { useVoiceStore } from '../voice.store'
import { RoomControl } from './RoomControl'

/**
 * The Share control (C-21 › Chia sẻ, S-ROOM-07), after Camera, only in a
 * room: `off` (`monitor-up`, "Share") opens the browser's picker; `on`
 * (`monitor-x`, "Stop sharing") stops; disabled while someone else shares
 * (D-101: one screen a room), the Tooltip saying who. No VIDEO, or a browser
 * that cannot share a screen: no control at all.
 */
export const ShareControl = forwardRef<
    HTMLButtonElement,
    {
        /** VIDEO in the room. */
        allowed: boolean
        /** The name of someone else sharing now. */
        other?: string
    }
>(({ allowed, other }, ref) => {
    const { t } = useTranslation('voice')
    const screen = useVoiceStore((state) => state.screen)
    if (!allowed || !canShareScreen()) return null
    const on = screen === 'on'
    const busy = !on && other !== undefined
    return (
        <RoomControl
            ref={ref}
            icon={on ? <MonitorX /> : <MonitorUp />}
            label={t(on ? 'controls.stopShare' : 'controls.share')}
            hint={busy ? t('controls.shareBusy', { name: other }) : t(on ? 'controls.stopShare' : 'controls.shareOn')}
            on={on}
            disabled={busy}
            onClick={() => void switchScreen(!on)}
        />
    )
})
ShareControl.displayName = 'ShareControl'

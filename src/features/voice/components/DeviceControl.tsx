import { useEffect } from 'react'
import { Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { deviceAllowedAgain, switchCamera, switchMic } from '../lib/session'
import { whenDeviceAllowed, type Device } from '../lib/devices'
import { useMicShortcut } from '../hooks/useMicShortcut'
import { useVoiceStore } from '../voice.store'
import { RoomControl } from './RoomControl'

const LOOKS = {
    mic: {
        on: Mic,
        off: MicOff,
        label: 'controls.mic',
        turnOn: 'controls.micOn',
        turnOff: 'controls.micOff',
        blocked: 'controls.micBlocked',
        notAllowed: 'controls.noSpeak',
        help: ['micBlocked.title', 'micBlocked.step1', 'micBlocked.step2', 'micBlocked.step3'],
        press: switchMic
    },
    camera: {
        on: Video,
        off: VideoOff,
        label: 'controls.camera',
        turnOn: 'controls.cameraOn',
        turnOff: 'controls.cameraOff',
        blocked: 'controls.cameraBlocked',
        notAllowed: 'controls.noVideo',
        help: ['cameraBlocked.title', 'cameraBlocked.step1', 'cameraBlocked.step2', 'cameraBlocked.step3'],
        press: switchCamera
    }
} as const

/**
 * The Mic or Camera control (C-21), on the preview page (icon only, D-53),
 * in the room: `off` / `on`; `blocked` when the browser refuses it (S-MOD-04:
 * a press opens "Turn the mic / camera back on", as the Banner's "How to fix"
 * does); disabled without SPEAK / VIDEO (07 câu L3-c). The mic muted by a
 * moderator (`modMuted`, 07 `mod-muted`, D-207): "Muted", disabled, the
 * Tooltip saying a moderator did it. Ctrl+Shift+M switches the mic while
 * its button shows and works (`useMicShortcut`): not on a page one may not
 * join.
 *
 * Which help is open is held by the page (`help`), which the Banner shares;
 * the browser allowing the device again closes it and puts the button back
 * to `off`.
 */
export function DeviceControl({
    device,
    allowed,
    modMuted = false,
    iconOnly,
    help,
    onHelp
}: {
    device: Device
    /** SPEAK for the mic, VIDEO for the camera. */
    allowed: boolean
    /** The mic muted by a moderator (D-207): until they unmute it or one leaves. */
    modMuted?: boolean
    iconOnly?: boolean
    help: Device | null
    onHelp: (help: Device | null) => void
}) {
    const { t } = useTranslation('voice')
    const looks = LOOKS[device]
    const state = useVoiceStore((store) => store[device])
    const blocked = state === 'blocked'
    const usable = allowed && !modMuted
    const on = usable && state === 'on'
    useMicShortcut(device === 'mic' && usable)
    useEffect(() => {
        if (!blocked) return
        return whenDeviceAllowed(device, () => {
            deviceAllowedAgain(device)
            onHelp(null)
        })
    }, [blocked, device, onHelp])

    const hint = t(
        !allowed
            ? looks.notAllowed
            : modMuted
              ? 'controls.modMutedHint'
              : blocked
                ? looks.blocked
                : on
                  ? looks.turnOff
                  : looks.turnOn
    )
    const Icon = on ? looks.on : looks.off
    const open = help === device
    return (
        <Popover open={open} onOpenChange={(next) => onHelp(next ? device : null)}>
            <PopoverAnchor asChild>
                <span>
                    <RoomControl
                        icon={<Icon />}
                        label={t(allowed && modMuted ? 'controls.modMuted' : looks.label)}
                        hint={hint}
                        on={on}
                        iconOnly={iconOnly}
                        disabled={!usable}
                        onClick={() => (blocked ? onHelp(open ? null : device) : void looks.press(state !== 'on'))}
                    />
                </span>
            </PopoverAnchor>
            <PopoverContent side='top' className='w-80'>
                <div className='flex flex-col gap-2'>
                    <h2 className='text-body-sm font-semibold text-text-primary'>{t(looks.help[0])}</h2>
                    <ol className='flex flex-col gap-1 text-label text-text-secondary'>
                        {looks.help.slice(1).map((step) => (
                            <li key={step}>{t(step)}</li>
                        ))}
                    </ol>
                </div>
            </PopoverContent>
        </Popover>
    )
}

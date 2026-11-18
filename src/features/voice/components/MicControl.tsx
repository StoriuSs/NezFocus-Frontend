import { useEffect } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { micAllowedAgain, switchMic } from '../lib/session'
import { whenMicrophoneAllowed } from '../lib/devices'
import { useMicShortcut } from '../hooks/useMicShortcut'
import { useVoiceStore } from '../voice.store'
import { RoomControl } from './RoomControl'

/**
 * The Mic control (C-21), on the preview page (icon only, D-53) and in the
 * room: `off` / `on`; `blocked` when the browser refuses it (S-MOD-04: a
 * press opens "Turn the mic back on", as the Banner's "How to fix" does);
 * disabled without SPEAK (07 câu L3-c). Ctrl+Shift+M switches it while it
 * shows (`useMicShortcut`): not on a page one may not join.
 *
 * The help is open while `helpOpen`, held by the page, which the Banner
 * shares; the browser allowing the mic again closes it and puts the button
 * back to `off`.
 */
export function MicControl({
    canSpeak,
    iconOnly,
    helpOpen,
    onHelpOpenChange
}: {
    canSpeak: boolean
    iconOnly?: boolean
    helpOpen: boolean
    onHelpOpenChange: (open: boolean) => void
}) {
    const { t } = useTranslation('voice')
    const mic = useVoiceStore((state) => state.mic)
    const blocked = mic === 'blocked'
    useMicShortcut(canSpeak)
    useEffect(() => {
        if (!blocked) return
        return whenMicrophoneAllowed(() => {
            micAllowedAgain()
            onHelpOpenChange(false)
        })
    }, [blocked, onHelpOpenChange])

    const hint = !canSpeak
        ? t('controls.noSpeak')
        : blocked
          ? t('controls.micBlocked')
          : t(mic === 'on' ? 'controls.micOff' : 'controls.micOn')
    return (
        <Popover open={helpOpen} onOpenChange={onHelpOpenChange}>
            <PopoverAnchor asChild>
                <span>
                    <RoomControl
                        icon={mic === 'on' && canSpeak ? <Mic /> : <MicOff />}
                        label={t('controls.mic')}
                        hint={hint}
                        on={canSpeak && mic === 'on'}
                        iconOnly={iconOnly}
                        disabled={!canSpeak}
                        onClick={() => (blocked ? onHelpOpenChange(!helpOpen) : void switchMic(mic !== 'on'))}
                    />
                </span>
            </PopoverAnchor>
            <PopoverContent side='top' className='w-80'>
                <MicHelp />
            </PopoverContent>
        </Popover>
    )
}

/** How to let the mic in again (S-MOD-04): what to press in the browser, and to reload if nothing changes. */
function MicHelp() {
    const { t } = useTranslation('voice')
    return (
        <div className='flex flex-col gap-2'>
            <h2 className='text-body-sm font-semibold text-text-primary'>{t('micBlocked.title')}</h2>
            <ol className='flex flex-col gap-1 text-label text-text-secondary'>
                <li>{t('micBlocked.step1')}</li>
                <li>{t('micBlocked.step2')}</li>
                <li>{t('micBlocked.step3')}</li>
            </ol>
        </div>
    )
}

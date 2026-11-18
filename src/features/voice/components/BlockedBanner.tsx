import { MicOff, VideoOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { Banner } from '@/components/Banner'
import type { Device } from '../lib/devices'
import { useVoiceStore } from '../voice.store'

/**
 * The browser blocking the mic or camera (S-MOD-04), under the room's Header
 * on the preview page and in the room: "How to fix" opens that button's
 * help. Both blocked: one Banner for the two, its help the mic's (the steps
 * are the same but for the device's name).
 */
export function BlockedBanner({ onHowTo }: { onHowTo: (device: Device) => void }) {
    const { t } = useTranslation('voice')
    const mic = useVoiceStore((state) => state.mic === 'blocked')
    const camera = useVoiceStore((state) => state.camera === 'blocked')
    if (!mic && !camera) return null
    const text = mic && camera ? t('devicesBlocked.banner') : mic ? t('micBlocked.banner') : t('cameraBlocked.banner')
    return (
        <Banner variant='strip' icon={mic ? MicOff : VideoOff}>
            {text}{' '}
            <button
                type='button'
                onClick={() => onHowTo(mic ? 'mic' : 'camera')}
                className='font-semibold text-text-primary underline-offset-4 hover:underline'
            >
                {t('devicesBlocked.howTo')}
            </button>
        </Banner>
    )
}

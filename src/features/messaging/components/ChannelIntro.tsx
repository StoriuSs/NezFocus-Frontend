import { Hash, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'

/**
 * ChannelIntro (C-10): at the bottom of a channel with no messages, and above
 * the first one. No mascot. A voice room's chat (S-ROOM-08) has the room's
 * icon and name, with no "#".
 */
export function ChannelIntro({ channelName, roomIcon: Icon }: { channelName: string; roomIcon?: LucideIcon }) {
    const { t } = useTranslation('messaging')
    const Shown = Icon ?? Hash
    return (
        <section className='p-4'>
            <div className='flex size-[72px] items-center justify-center rounded-full bg-surface-2'>
                <Shown className='size-10 text-text-secondary' aria-hidden='true' />
            </div>
            <h2 className='mt-4 text-title-2 font-semibold text-text-primary'>
                {t(Icon ? 'intro.roomTitle' : 'intro.title', { channel: channelName })}
            </h2>
            <p className='mt-1 text-body text-text-secondary'>{t(Icon ? 'intro.roomBody' : 'intro.body')}</p>
        </section>
    )
}

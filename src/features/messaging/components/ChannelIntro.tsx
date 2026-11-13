import { Hash } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'

/** ChannelIntro (C-10): at the bottom of a channel with no messages, and above the first one. No mascot. */
export function ChannelIntro({ channelName }: { channelName: string }) {
    const { t } = useTranslation('messaging')
    return (
        <section className='p-4'>
            <div className='flex size-[72px] items-center justify-center rounded-full bg-surface-2'>
                <Hash className='size-10 text-text-secondary' aria-hidden='true' />
            </div>
            <h2 className='mt-4 text-title-2 font-semibold text-text-primary'>
                {t('intro.title', { channel: channelName })}
            </h2>
            <p className='mt-1 text-body text-text-secondary'>{t('intro.body')}</p>
        </section>
    )
}

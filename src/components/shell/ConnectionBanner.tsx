import { Loader2, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Banner } from '@/components/Banner'
import type { ConnectionNotice } from './shell-context'

/**
 * The connection strip under a page's Header (C-16 `reconnecting` /
 * `offline`, S-SHELL-01): 36 high, full width, neutral. "Messages will send
 * when you are back online" only where there is a message box to send from
 * (`composer`); elsewhere nothing waits to be sent.
 */
export function ConnectionBanner({ status, composer = false }: { status: ConnectionNotice; composer?: boolean }) {
    const { t } = useTranslation()

    if (status === 'reconnecting') {
        return (
            <Banner icon={Loader2} variant='strip' iconClassName='animate-spin motion-reduce:animate-none'>
                {t('shell.connection.reconnecting')}
            </Banner>
        )
    }
    return (
        <Banner icon={WifiOff} variant='strip'>
            {t(composer ? 'shell.connection.offlineWithComposer' : 'shell.connection.offline')}
        </Banner>
    )
}

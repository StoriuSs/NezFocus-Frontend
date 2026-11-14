import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Button } from '@/components/ui/button'
import { READ_COUNT_CAP } from '../lib/read-state-cache'

/**
 * NewMessagesBar (C-10): a 32 strip under the header while the channel has
 * unread messages, "14 new messages since 20:31" ("99+" past 99). The words
 * go to the "New" line; "Mark as read" reads the whole channel.
 */
export function NewMessagesBar({
    count,
    since,
    onShow,
    onMarkRead
}: {
    count: number
    /** The first unread message's time, as messages show theirs. */
    since: string
    onShow: () => void
    onMarkRead: () => void
}) {
    const { t } = useTranslation('messaging')
    return (
        <div className='flex h-8 shrink-0 items-center gap-2 bg-surface-2 pl-4 pr-2'>
            <button
                type='button'
                onClick={onShow}
                className='min-w-0 truncate text-label font-semibold text-text-primary'
            >
                {count >= READ_COUNT_CAP
                    ? t('unread.sinceMany', { time: since })
                    : t('unread.since', { count, time: since })}
            </button>
            <Button variant='text' size='sm' className='ml-auto h-7 px-2 text-label' onClick={onMarkRead}>
                {t('unread.markRead')}
            </Button>
        </div>
    )
}

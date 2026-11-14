import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'

/**
 * Divider/new (C-10): a `danger` line across, the "New" tag at its right end,
 * above the first unread message. Where a day begins there too, one line for
 * both (Divider/new+date): the day in `danger` at its middle.
 */
export function NewDivider({ day }: { day?: string }) {
    const { t } = useTranslation('messaging')
    const label = t('unread.divider')
    return (
        <div
            role='separator'
            aria-label={day ? `${day}, ${label}` : label}
            className='flex items-center gap-3 px-4 py-3'
        >
            {day ? (
                <>
                    <span className='h-px flex-1 bg-danger' aria-hidden='true' />
                    <span className='text-label font-semibold text-danger' aria-hidden='true'>
                        {day}
                    </span>
                </>
            ) : null}
            <span className='flex flex-1 items-center' aria-hidden='true'>
                <span className='h-px flex-1 bg-danger' />
                <span className='rounded-badge bg-danger px-1.5 text-micro font-semibold text-bg'>{label}</span>
            </span>
        </div>
    )
}

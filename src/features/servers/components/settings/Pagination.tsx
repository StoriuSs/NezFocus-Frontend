import '@/i18n/servers'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { Select } from '@/components/ui/select'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PageSize } from '../../api/roles.api'
import { pageButtons } from '../../lib/moderation'

const SIZES: PageSize[] = [10, 50, 100]

/**
 * The page bar under a table (C-40, D-90): "Show [50 ▾] of 137 members",
 * then ‹ 1 2 3 ›. Hidden while ten or fewer match (04 › S-SET-03).
 */
export function Pagination({
    page,
    limit,
    total,
    of,
    perPage,
    onPage,
    onLimit
}: {
    page: number
    limit: PageSize
    total: number
    /** "of 137 members" */
    of: string
    /** The name of the size field. */
    perPage: string
    onPage: (page: number) => void
    onLimit: (limit: PageSize) => void
}) {
    const { t } = useTranslation('servers')
    if (total <= 10) return null
    const pages = Math.max(1, Math.ceil(total / limit))

    return (
        <nav aria-label={of} className='flex flex-wrap items-center gap-3 text-body-sm text-text-secondary'>
            <span className='flex flex-1 items-center gap-2'>
                {t('pagination.show')}
                <Select
                    aria-label={perPage}
                    className='w-24'
                    value={String(limit)}
                    onValueChange={(value) => onLimit(Number(value) as PageSize)}
                    options={SIZES.map((size) => ({ value: String(size), label: String(size) }))}
                />
                <span>{of}</span>
            </span>
            <span className='flex items-center gap-1'>
                <WithTooltip label={t('pagination.previous')}>
                    <IconButton label={t('pagination.previous')} disabled={page <= 1} onClick={() => onPage(page - 1)}>
                        <ChevronLeft />
                    </IconButton>
                </WithTooltip>
                {pageButtons(page, pages).map((button, index) =>
                    button === 'gap' ? (
                        <span key={`gap-${index}`} aria-hidden='true' className='w-8 text-center'>
                            …
                        </span>
                    ) : (
                        <button
                            key={button}
                            type='button'
                            aria-label={t('pagination.page', { page: button })}
                            aria-current={button === page ? 'page' : undefined}
                            onClick={() => onPage(button)}
                            className={cn(
                                'size-8 rounded-button tabular-nums transition-colors duration-micro hover:bg-surface-2',
                                button === page && 'bg-surface-2 font-semibold text-text-primary'
                            )}
                        >
                            {button}
                        </button>
                    )
                )}
                <WithTooltip label={t('pagination.next')}>
                    <IconButton label={t('pagination.next')} disabled={page >= pages} onClick={() => onPage(page + 1)}>
                        <ChevronRight />
                    </IconButton>
                </WithTooltip>
            </span>
        </nav>
    )
}

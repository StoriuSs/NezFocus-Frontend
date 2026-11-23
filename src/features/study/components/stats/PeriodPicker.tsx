import type { KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { IconButton } from '@/components/ui/icon-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { WithTooltip } from '@/components/ui/tooltip'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { cn } from '@/lib/utils'
import { useStatsView } from '../../hooks/useStatsView'
import { monthText, rangeText } from '../../lib/day-words'
import { isEarliest, isLatest, shiftPeriod, switchView, type StatsPeriod, type StatsView } from '../../lib/periods'
import type { AnySession } from '../../types'

/**
 * The Stats page's period (08 S-STUDY-03 › Chọn kỳ, D-105), for the whole
 * page: "Tuần | Tháng", then "‹ 12/10 – 18/10 ›" ("Tháng 10/2026"). "›" off
 * on the period holding today; "‹" off on the one holding the first day
 * counted, saying so in its Tooltip. ← → on "‹ ›" go back and on. Offline,
 * all off (the numbers read stay). Not on the empty page. In the Header
 * from 1024 up, under it below (`className`).
 */
export default function PeriodPicker({
    period,
    show,
    joined,
    solo,
    className
}: {
    period: StatsPeriod
    show: (period: StatsPeriod) => void
    joined: AnySession | null
    solo: AnySession | null
    className?: string
}) {
    const { t, i18n } = useTranslation('study')
    const online = useBrowserOnline()
    const { today, view } = useStatsView(period, joined, solo, { live: false })
    if (view?.empty) return null

    const earliest = !online || isEarliest(period, view?.firstDate ?? null)
    const latest = !online || isLatest(period, today)
    const go = (step: 1 | -1) => {
        if (step === -1 ? earliest : latest) return
        show(shiftPeriod(period, step, today))
    }
    const onKeyDown = (event: KeyboardEvent) => {
        const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : null
        if (step === null) return
        event.preventDefault()
        go(step)
    }
    const label =
        period.view === 'week'
            ? rangeText(t, period.start, period.end, today, i18n.language)
            : monthText(t, period.start, i18n.language)
    const off = 'text-text-tertiary'

    return (
        <div role='group' aria-label={t('stats.picker')} className={cn('flex items-center gap-4', className)}>
            <SegmentedControl<StatsView>
                variant='view'
                value={period.view}
                disabled={!online}
                onValueChange={(view) => show(switchView(period, view))}
                segments={[
                    { value: 'week', label: t('stats.week') },
                    { value: 'month', label: t('stats.month') }
                ]}
            />
            <div className='flex items-center gap-1'>
                <WithTooltip
                    label={view && isEarliest(period, view.firstDate) ? t('stats.noEarlier') : t('stats.previous')}
                >
                    <IconButton
                        label={t('stats.previous')}
                        aria-disabled={earliest}
                        className={cn(earliest && off)}
                        onKeyDown={onKeyDown}
                        onClick={() => go(-1)}
                    >
                        <ChevronLeft />
                    </IconButton>
                </WithTooltip>
                <span aria-live='polite' className='text-center text-body font-semibold text-text-primary'>
                    {label}
                </span>
                <WithTooltip label={t('stats.next')}>
                    <IconButton
                        label={t('stats.next')}
                        aria-disabled={latest}
                        className={cn(latest && off)}
                        onKeyDown={onKeyDown}
                        onClick={() => go(1)}
                    >
                        <ChevronRight />
                    </IconButton>
                </WithTooltip>
            </div>
        </div>
    )
}

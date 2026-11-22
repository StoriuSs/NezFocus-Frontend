import type { TFunction } from 'i18next'
import '@/i18n/study'

/**
 * Minutes studied as 07 › Quy ước writes them: "45 phút", from 60 minutes
 * "1 giờ 54 phút" ("2 giờ" on the hour). Whole minutes, rounded down.
 */
export function studiedText(t: TFunction<'study'>, seconds: number): string {
    const minutes = Math.floor(Math.max(0, seconds) / 60)
    if (minutes < 60) return t('minutes', { count: minutes })
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest === 0 ? t('hours', { hours }) : t('hoursMinutes', { hours, minutes: rest })
}

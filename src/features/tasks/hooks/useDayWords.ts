import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/tasks'
import type { DayWords } from '../lib/due-text'

const WEEKDAYS = ['0', '1', '2', '3', '4', '5', '6'] as const

/** The words due dates are written with, in the language on screen (05 › Quy ước › Thời gian). */
export function useDayWords(): DayWords {
    const { t } = useTranslation('tasks')
    return useMemo(
        () => ({
            today: t('due.today'),
            tomorrow: t('due.tomorrow'),
            weekdays: WEEKDAYS.map((day) => t(`due.weekday.${day}`)),
            overdue: t('due.overdue'),
            done: t('due.done'),
            noDue: t('due.none')
        }),
        // `t` changes with the language.
        [t]
    )
}

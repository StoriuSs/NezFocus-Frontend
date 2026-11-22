import type { TFunction } from 'i18next'
import '@/i18n/study'
import type { StudyCycle } from './study-cycle'

/** "45 phút tập trung · nghỉ 10 · nghỉ dài 20 sau mỗi 4 vòng" (S-ROOM-03 `custom-long-break`). */
export function cycleSummary(t: TFunction<'study'>, cycle: StudyCycle): string {
    return cycle.longBreak === null
        ? t('cycle.summary', { focus: cycle.focus, shortBreak: cycle.shortBreak })
        : t('cycle.summaryLongBreak', {
              focus: cycle.focus,
              shortBreak: cycle.shortBreak,
              longBreak: cycle.longBreak,
              every: cycle.longBreakEvery
          })
}

/** "50/10", "45/10 · nghỉ dài 20 sau mỗi 4 vòng": a cycle named in the menu and the toasts. */
export function cycleName(
    t: TFunction<'study'>,
    cycle: Pick<StudyCycle, 'focus' | 'shortBreak' | 'longBreak' | 'longBreakEvery'>
): string {
    return cycle.longBreak === null || cycle.longBreakEvery === null
        ? t('cycle.short', { focus: cycle.focus, shortBreak: cycle.shortBreak })
        : t('cycle.shortLongBreak', {
              focus: cycle.focus,
              shortBreak: cycle.shortBreak,
              longBreak: cycle.longBreak,
              every: cycle.longBreakEvery
          })
}

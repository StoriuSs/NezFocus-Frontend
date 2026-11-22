import i18n from '@/i18n'
import en from './locales/en/study.json'
import vi from './locales/vi/study.json'

/**
 * The words of study sessions (07, 08: the rhythm ring, the start and cycle
 * dialogs, the Host's controls, the summary), in their own namespace,
 * `study`, added when a part of the study feature loads, as `tasks` is
 * (src/i18n/tasks.ts).
 */
export const studyResources = { en, vi } as const

i18n.addResourceBundle('en', 'study', en, true, true)
i18n.addResourceBundle('vi', 'study', vi, true, true)

import { LampDesk, Timer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { Tag } from '@/components/settings/SettingsRow'
import { lineTime, lineTitle, lineWhen } from '../../lib/history'
import type { StudyHistoryLine } from '../../types'

/**
 * A line of the history (C-47, D-105): where (`lamp-desk` a room, `timer`
 * Học một mình), when, how long; 56 high, read only. The one one is in:
 * "– bây giờ", Tag "Đang học" before its minutes, which grow (`seconds`).
 */
export function SessionRow({
    line,
    seconds,
    today,
    timeZone
}: {
    line: StudyHistoryLine
    seconds: number
    today: string
    timeZone: string | undefined
}) {
    const { t, i18n } = useTranslation('study')
    const Icon = line.kind === 'solo' ? Timer : LampDesk
    return (
        <li className='flex h-14 items-center gap-3 border-b px-2'>
            <Icon aria-hidden='true' className='size-4 shrink-0 text-text-secondary' />
            <div className='flex min-w-0 flex-1 flex-col'>
                <span className='truncate text-body-sm font-semibold text-text-primary'>{lineTitle(t, line)}</span>
                <span className='truncate text-label text-text-tertiary'>
                    {lineWhen(t, line, today, i18n.language, timeZone)}
                </span>
            </div>
            {line.lastLeftAt === null ? <Tag>{t('stats.studying')}</Tag> : null}
            <span className='shrink-0 font-numeric text-numeric-inline text-text-primary'>{lineTime(t, seconds)}</span>
        </li>
    )
}

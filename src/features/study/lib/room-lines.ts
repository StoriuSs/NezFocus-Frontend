import type { TFunction } from 'i18next'
import '@/i18n/study'
import type { AnySession, SessionNews } from '../types'

/** The line under the ring (07 S-ROOM-02 › Nội dung chữ): never counting oneself (07 › luật 3). */
export function peopleLine(t: TFunction<'study'>, session: AnySession | null, others: number): string {
    if (!session) return others > 0 ? t('people.idle', { count: others }) : t('people.idleAlone')
    if (session.phase !== 'focus' && session.status !== 'paused') return t(`people.${session.phase}`)
    if (others === 0) return t('people.alone')
    return session.status === 'paused' ? t('people.paused', { count: others }) : t('people.focus', { count: others })
}

/** Who ended it (07 `ended`, › Edge): oneself, someone, the study room turned off; nothing when it ended by itself. */
export function endLine(
    t: TFunction<'study'>,
    ended: SessionNews,
    me: string,
    nameOf: (userId: string) => string
): string | null {
    if (ended.endedReason === 'study_disabled') return t('end.studyOff')
    if (ended.endedReason !== 'stopped' || !ended.actorId) return null
    return ended.actorId === me ? t('end.byYou') : t('end.byOther', { name: nameOf(ended.actorId) })
}

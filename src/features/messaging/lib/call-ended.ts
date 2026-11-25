import type { TFunction } from 'i18next'

/** How a call ended, as its system message keeps it (`status`, D-245): answered and over, or not. */
export type CallOutcome = 'ended' | 'missed' | 'declined' | 'failed'

/** A DM's call, as its `call_ended` system message says it (REQ-MSG-08, D-106, D-250). */
export interface CallEnded {
    /** Who called; null when the message names no one. */
    callerId: string | null
    outcome: CallOutcome
    video: boolean
    /** How long it lasted, answered calls only. */
    seconds: number | null
}

const OUTCOMES: readonly string[] = ['ended', 'missed', 'declined', 'failed'] satisfies CallOutcome[]

/** The call a system message tells of, or null for any other message (or one this app cannot read). */
export function callEndedOf(
    systemEvent: string | null | undefined,
    data: Record<string, unknown> | null | undefined
): CallEnded | null {
    if (systemEvent !== 'call_ended' || !data || !OUTCOMES.includes(data.status as string)) return null
    return {
        callerId: typeof data.userId === 'string' ? data.userId : null,
        outcome: data.status as CallOutcome,
        video: data.video === true,
        seconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : null
    }
}

/**
 * How long a call lasted, rounded down to the minute (09 › Luật chung):
 * "dưới 1 phút", "12 phút", from an hour "1 giờ 2 phút" ("1 giờ" on the hour).
 * Words of the `common` namespace (`call.*`): the chat and the DM's row both say it.
 */
export function callLengthWords(seconds: number, t: TFunction<'common'>): string {
    const minutes = Math.floor(seconds / 60)
    if (minutes < 1) return t('call.underAMinute')
    if (minutes < 60) return t('call.minutes', { count: minutes })
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest === 0 ? t('call.hours', { count: hours }) : t('call.hoursMinutes', { hours, minutes: rest })
}

/**
 * What came of the call, as the chat's message ends (09 Q4): "Cuộc gọi nhỡ",
 * "Cuộc gọi bị từ chối", "Không kết nối được", or how long it lasted; empty
 * for one answered whose length is not known.
 */
export function callResultWords(call: CallEnded, t: TFunction<'common'>): string {
    if (call.outcome !== 'ended') return t(`call.${call.outcome}`)
    return call.seconds === null ? '' : callLengthWords(call.seconds, t)
}

/**
 * A DM row's second line for a call (C-30): the outcome alone when it was
 * not answered, "Cuộc gọi · 12 phút" when it was; "Cuộc gọi" for one this app
 * cannot read, or answered with no length known.
 */
export function callRowWords(call: CallEnded | null, t: TFunction<'common'>): string {
    if (!call || (call.outcome === 'ended' && call.seconds === null)) return t('shell.messages.call')
    return call.outcome === 'ended' ? t('call.length', { length: callResultWords(call, t) }) : callResultWords(call, t)
}

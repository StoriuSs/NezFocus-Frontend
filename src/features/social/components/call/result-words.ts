import type { TFunction } from 'i18next'
import { callClock, type CallResult } from '../../lib/call-result'

/**
 * What a call's result says (C-48 › Kết quả): "Cuộc gọi bị từ chối", "{Chi}
 * đang bận", "{Chi} không trả lời", "Mất kết nối · 08:41", "Không kết nối
 * được", "Cuộc gọi đã kết thúc · 03:15". The Stage shows it; a Toast says it
 * when one is on another page (09 DM-EDGE "Kết thúc đúng lúc bấm").
 */
export function resultWords(t: TFunction<'social'>, result: CallResult, name: string): string {
    const words = {
        declined: t('call.result.declined'),
        busy: t('call.result.busy', { name }),
        'no-answer': t('call.result.noAnswer', { name }),
        dropped: t('call.result.dropped'),
        failed: t('call.result.failed'),
        ended: t('call.result.ended')
    }[result.kind]
    const timed = result.kind === 'ended' || result.kind === 'dropped'
    return timed && result.seconds !== null ? `${words} · ${callClock(result.seconds * 1000)}` : words
}

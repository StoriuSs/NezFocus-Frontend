import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { callEndedOf, callLengthWords, callResultWords, callRowWords } from '../lib/call-ended'

const vi = i18n.getFixedT('vi', 'common')
const en = i18n.getFixedT('en', 'common')

const data = (more: Record<string, unknown> = {}) => ({
    userId: 'binh',
    callId: 'call-1',
    status: 'ended',
    endReason: null,
    video: false,
    durationSeconds: 754,
    ...more
})

describe('A call’s system message (09 Q4, D-250)', () => {
    it('reads who called, how it went, its kind and length', () => {
        expect(callEndedOf('call_ended', data())).toEqual({
            callerId: 'binh',
            outcome: 'ended',
            video: false,
            seconds: 754
        })
        expect(callEndedOf('call_ended', data({ status: 'missed', video: true, durationSeconds: null }))).toEqual({
            callerId: 'binh',
            outcome: 'missed',
            video: true,
            seconds: null
        })
    })

    it('is no call for another message, no data, or a status it does not know', () => {
        expect(callEndedOf('message_pinned', data())).toBeNull()
        expect(callEndedOf('call_ended', null)).toBeNull()
        expect(callEndedOf('call_ended', data({ status: 'ringing' }))).toBeNull()
        expect(callEndedOf(null, data())).toBeNull()
    })

    it('rounds the length down to the minute: under a minute, minutes, hours and minutes', () => {
        expect(callLengthWords(59, vi)).toBe('dưới 1 phút')
        expect(callLengthWords(60, vi)).toBe('1 phút')
        expect(callLengthWords(12 * 60 + 59, vi)).toBe('12 phút')
        expect(callLengthWords(3600, vi)).toBe('1 giờ')
        expect(callLengthWords(3600 + 2 * 60 + 30, vi)).toBe('1 giờ 2 phút')
        expect(callLengthWords(2 * 60, en)).toBe('2 minutes')
        expect(callLengthWords(1, en)).toBe('under a minute')
    })

    it('says what came of it: missed, declined, not connected, or how long it lasted', () => {
        const said = (more: Record<string, unknown>) => callResultWords(callEndedOf('call_ended', data(more))!, vi)
        expect(said({ status: 'missed', durationSeconds: null })).toBe('Cuộc gọi nhỡ')
        expect(said({ status: 'declined', durationSeconds: null })).toBe('Cuộc gọi bị từ chối')
        expect(said({ status: 'failed', durationSeconds: null })).toBe('Không kết nối được')
        expect(said({})).toBe('12 phút')
        expect(said({ durationSeconds: null })).toBe('')
    })

    it('says a DM row’s line: the outcome alone, "Cuộc gọi · 12 phút" answered, "Cuộc gọi" when unknown (C-30)', () => {
        const row = (more: Record<string, unknown>) => callRowWords(callEndedOf('call_ended', data(more)), vi)
        expect(row({ status: 'missed', durationSeconds: null })).toBe('Cuộc gọi nhỡ')
        expect(row({})).toBe('Cuộc gọi · 12 phút')
        expect(row({ durationSeconds: null })).toBe('Cuộc gọi')
        expect(callRowWords(null, vi)).toBe('Cuộc gọi')
    })
})

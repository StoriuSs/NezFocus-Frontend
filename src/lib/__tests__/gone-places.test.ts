import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { toast } from 'sonner'
import { apiError } from '@/test/helpers'
import { aboutGonePlace, forgetPlaces, rememberPlaces } from '../gone-places'
import { notifyMutationError } from '../query-client'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

const to = (url: string) => ({ config: { url, headers: {} } as InternalAxiosRequestConfig })

afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
})

describe('Requests about a place one no longer has (11 S-MOD-02 E9)', () => {
    it('knows a refused request about a server or channel let go', () => {
        forgetPlaces(['srv-gone-1', 'chn-gone-1'])

        expect(aboutGonePlace(apiError(404, 'NOT_FOUND_ERROR', to('/servers/srv-gone-1/members')))).toBe(true)
        expect(aboutGonePlace(apiError(403, 'FORBIDDEN_ERROR', to('/channels/chn-gone-1/messages?limit=50')))).toBe(
            true
        )
    })

    it('leaves other requests alone', () => {
        forgetPlaces(['srv-gone-2'])

        expect(aboutGonePlace(apiError(404, 'NOT_FOUND_ERROR', to('/servers/srv-kept/members')))).toBe(false)
        // Part of an id is not the id.
        expect(aboutGonePlace(apiError(404, 'NOT_FOUND_ERROR', to('/servers/srv-gone-2x')))).toBe(false)
        expect(aboutGonePlace(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false)
        expect(aboutGonePlace(new Error('bug'))).toBe(false)
    })

    it('forgets them after two minutes: a request then is about a server joined again', () => {
        vi.useFakeTimers()
        forgetPlaces(['srv-gone-3'])
        const late = apiError(404, 'NOT_FOUND_ERROR', to('/servers/srv-gone-3'))

        vi.advanceTimersByTime(119_000)
        expect(aboutGonePlace(late)).toBe(true)
        vi.advanceTimersByTime(2000)
        expect(aboutGonePlace(late)).toBe(false)
    })

    it('lets one be again as soon as it is back: a server joined again, with its channels and their messages', () => {
        forgetPlaces(['srv-back'])
        forgetPlaces(['chn-back', 'msg-back'], 'chn-back')

        rememberPlaces(['srv-back', 'chn-back'])

        expect(aboutGonePlace(apiError(404, 'NOT_FOUND_ERROR', to('/servers/srv-back/members')))).toBe(false)
        expect(aboutGonePlace(apiError(404, 'NOT_FOUND_ERROR', to('/channels/chn-back/messages')))).toBe(false)
        expect(aboutGonePlace(apiError(404, 'NOT_FOUND_ERROR', to('/messages/msg-back')))).toBe(false)
    })

    it('says nothing of a failed change about one, as the dialog said enough', () => {
        forgetPlaces(['msg-gone-4'])

        notifyMutationError(apiError(404, 'NOT_FOUND_ERROR', to('/messages/msg-gone-4/reactions/%F0%9F%91%8D')))
        expect(toast.error).not.toHaveBeenCalled()

        notifyMutationError(apiError(404, 'NOT_FOUND_ERROR', to('/messages/msg-kept')))
        expect(toast.error).toHaveBeenCalledTimes(1)
    })
})

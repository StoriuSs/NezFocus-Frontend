import { afterEach, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { InternalAxiosRequestConfig } from 'axios'
import { apiError } from '@/test/helpers'
import { userKeys } from '@/features/users'
import { aboutGonePlace } from '@/lib/gone-places'
import { forgetChannels } from '../api/forgetChannels'
import { messageKeys } from '../api/keys'
import type { ChannelMessages } from '../types'

const history = (...ids: string[]) =>
    ({
        pages: [{ items: ids.map((id) => ({ id })), hasMoreBefore: false, hasMoreAfter: false }],
        pageParams: [null]
    }) as unknown as ChannelMessages

const refusedAt = (url: string) =>
    apiError(404, 'NOT_FOUND_ERROR', { config: { url, headers: {} } as InternalAxiosRequestConfig })

afterEach(() => sessionStorage.clear())

describe('Letting go of channels one may no longer see (D-178, 11 S-MOD-02)', () => {
    function client() {
        const queryClient = new QueryClient()
        queryClient.setQueryData(userKeys.profile(), { id: 'binh' })
        queryClient.setQueryData(messageKeys.channel('hoi-dap'), history('m-1', 'm-2'))
        queryClient.setQueryData(messageKeys.pins('hoi-dap'), [])
        queryClient.setQueryData(messageKeys.channel('tai-lieu'), history('m-9'))
        return queryClient
    }

    it('drops their histories and pins, and no other', () => {
        const queryClient = client()

        forgetChannels(queryClient, ['hoi-dap'])

        expect(queryClient.getQueryData(messageKeys.channel('hoi-dap'))).toBeUndefined()
        expect(queryClient.getQueryData(messageKeys.pins('hoi-dap'))).toBeUndefined()
        expect(queryClient.getQueryData(messageKeys.channel('tai-lieu'))).toBeDefined()
    })

    it('drops what was typed in them, nothing typed elsewhere', () => {
        const queryClient = client()
        sessionStorage.setItem('draft:binh:hoi-dap', JSON.stringify({ text: 'Câu 4 làm sao', names: {} }))
        sessionStorage.setItem('draft:binh:tai-lieu', JSON.stringify({ text: 'Đề cương', names: {} }))

        forgetChannels(queryClient, ['hoi-dap'])

        expect(sessionStorage.getItem('draft:binh:hoi-dap')).toBeNull()
        expect(sessionStorage.getItem('draft:binh:tai-lieu')).not.toBeNull()
    })

    it('marks them, and the messages read in them, as gone: a request about one fails without a Toast', () => {
        const queryClient = client()

        forgetChannels(queryClient, ['hoi-dap'])

        expect(aboutGonePlace(refusedAt('/channels/hoi-dap/messages'))).toBe(true)
        expect(aboutGonePlace(refusedAt('/messages/m-2/reactions/x'))).toBe(true)
        expect(aboutGonePlace(refusedAt('/messages/m-9'))).toBe(false)
    })
})

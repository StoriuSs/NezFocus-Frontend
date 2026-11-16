import { afterEach, describe, expect, it } from 'vitest'
import { queryClient } from '@/lib/query-client'
import { accountTimeZone } from '@/lib/time-zones'
import { userKeys } from '../api/keys'
import '../api/settingsCache'

describe('The account’s time zone, lent to src/lib', () => {
    afterEach(() => queryClient.clear())

    it('is the one in the settings the shell holds, as they are now', () => {
        expect(accountTimeZone()).toBeUndefined()
        queryClient.setQueryData(userKeys.settings(), { timezone: 'Asia/Ho_Chi_Minh' })
        expect(accountTimeZone()).toBe('Asia/Ho_Chi_Minh')
        queryClient.setQueryData(userKeys.settings(), { timezone: 'Europe/Paris' })
        expect(accountTimeZone()).toBe('Europe/Paris')
    })
})

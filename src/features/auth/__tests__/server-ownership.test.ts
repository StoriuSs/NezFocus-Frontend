import { describe, expect, it } from 'vitest'
import { apiError } from '@/test/helpers'
import { blockingServers, serverOwnership } from '../lib/server-ownership'

const OT = { id: 'ot', name: 'Ôn thi Giải tích 2', memberCount: 13 }

describe('blockingServers (OWNERSHIP_TRANSFER_REQUIRED, D-76)', () => {
    it('reads the servers the refusal lists', () => {
        expect(blockingServers(apiError(409, 'OWNERSHIP_TRANSFER_REQUIRED', { data: { servers: [OT] } }))).toEqual([OT])
    })

    it('leaves out a row it cannot read; with none left, it is any other refusal', () => {
        const odd = { servers: [OT, { id: 'nd', name: 'Nhóm Đề cương' }, null] }
        expect(blockingServers(apiError(409, 'OWNERSHIP_TRANSFER_REQUIRED', { data: odd }))).toEqual([OT])
        expect(blockingServers(apiError(409, 'OWNERSHIP_TRANSFER_REQUIRED'))).toBeNull()
        expect(blockingServers(apiError(409, 'OWNERSHIP_TRANSFER_REQUIRED', { data: { servers: [null] } }))).toBeNull()
    })

    it('is null for any other error', () => {
        expect(blockingServers(apiError(400, 'AUTH_CURRENT_PASSWORD_INVALID', { data: { servers: [OT] } }))).toBeNull()
        expect(blockingServers(new Error('bug'))).toBeNull()
    })
})

describe('serverOwnership', () => {
    it('says the port is not connected rather than finding no servers', () => {
        expect(() => serverOwnership()).toThrow('ServerOwnership is not connected')
    })
})

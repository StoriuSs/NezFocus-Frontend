import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { apiError } from '@/test/helpers'
import {
    highestRoleName,
    notFoundServerId,
    ownedServers,
    pageAfterHandover,
    serverAfter,
    transferRefusal
} from '../lib/membership'
import { toastName } from '../lib/server-name'
import { sameTyped } from '../lib/typed-name'

/** MANAGE_SERVER (bit 1) and KICK_MEMBERS (bit 4), as lib/permissions.ts numbers them. */
const MANAGE_SERVER = 1n << 1n
const KICK = 1n << 4n
const bits = (...values: bigint[]) => String(values.reduce((all, bit) => all | bit, 0n))

const notFound = (url: string) => apiError(404, 'NOT_FOUND_ERROR', { config: { url, headers: new AxiosHeaders() } })

describe('serverAfter (03 S-SRV-04 Q7)', () => {
    const rail = [{ id: 'ot' }, { id: 'nd' }, { id: 'cg' }]

    it('opens the next server below the one gone, not the one above', () => {
        expect(serverAfter(rail, 'nd')).toBe('cg')
    })

    it('opens the one above when it was the last', () => {
        expect(serverAfter(rail, 'cg')).toBe('nd')
    })

    it('has nowhere to go when it was the only one', () => {
        expect(serverAfter([{ id: 'ot' }], 'ot')).toBeNull()
    })
})

describe('highestRoleName (S-SET-07 picker)', () => {
    const server = {
        roles: [
            { id: 'admin', name: 'Quản trị', position: 3, administrator: true },
            { id: 'lead', name: 'Trưởng nhóm', position: 2, administrator: false },
            { id: 'coord', name: 'Điều phối phòng học', position: 1, administrator: false }
        ]
    }

    it('names the highest of the roles they hold', () => {
        expect(highestRoleName(server, { roleIds: ['coord', 'lead'] })).toBe('Trưởng nhóm')
    })

    it('names none with only @everyone', () => {
        expect(highestRoleName(server, { roleIds: [] })).toBeNull()
    })
})

describe('transferRefusal', () => {
    it('reads the rules the API refuses a recipient for', () => {
        const refused = (rule: string) => apiError(422, 'VALIDATION_ERROR', { data: { rule } })
        expect(transferRefusal(refused('recipient_pending_deletion'))).toBe('pending_deletion')
        expect(transferRefusal(refused('recipient_timed_out'))).toBe('timed_out')
        expect(transferRefusal(apiError(404, 'NOT_FOUND_ERROR'))).toBe('gone')
    })

    it('leaves anything else to the usual message', () => {
        expect(transferRefusal(apiError(422, 'VALIDATION_ERROR', { data: { rule: 'recipient_self' } }))).toBeNull()
        expect(transferRefusal(apiError(403, 'FORBIDDEN_ERROR'))).toBeNull()
    })
})

describe('notFoundServerId (D-143)', () => {
    it('names the server of a request under /servers/{id} refused as not found', () => {
        expect(notFoundServerId(notFound('/servers/ot/members'))).toBe('ot')
        expect(notFoundServerId(notFound('/servers/ot'))).toBe('ot')
    })

    it('ignores other refusals, other routes and errors without an answer', () => {
        expect(
            notFoundServerId(
                apiError(403, 'FORBIDDEN_ERROR', { config: { url: '/servers/ot', headers: new AxiosHeaders() } })
            )
        ).toBeNull()
        expect(notFoundServerId(notFound('/invites/abc'))).toBeNull()
        expect(notFoundServerId(new AxiosError('offline'))).toBeNull()
        expect(notFoundServerId(new Error('bug'))).toBeNull()
    })
})

describe('pageAfterHandover (S-SET-07 `transferred`)', () => {
    const lead = { id: 'ot', permissions: bits(KICK) }

    it('moves a page they may no longer open to the first they may', () => {
        expect(pageAfterHandover('/servers/ot/settings/overview', lead)).toBe('/servers/ot/settings/members')
    })

    it('keeps a page they may still open', () => {
        expect(pageAfterHandover('/servers/ot/settings/members', lead)).toBeNull()
        const manager = { id: 'ot', permissions: bits(MANAGE_SERVER) }
        expect(pageAfterHandover('/servers/ot/settings/overview', manager)).toBeNull()
    })

    it('goes back to the server when no settings page is left', () => {
        expect(pageAfterHandover('/servers/ot/settings/overview', { id: 'ot', permissions: '0' })).toBe('/channels/ot')
    })

    it('leaves any other page alone', () => {
        expect(pageAfterHandover('/channels/ot/hoi-dap', lead)).toBeNull()
        expect(pageAfterHandover('/servers/nd/settings/overview', lead)).toBeNull()
    })
})

describe('sameTyped (C-14 `type-name`)', () => {
    it('leaves out case, accents and spaces at the ends, đ as d', () => {
        expect(sameTyped('  ôn thi giải tích 2 ', 'Ôn thi Giải tích 2')).toBe(true)
        expect(sameTyped('on thi giai tich 2', 'Ôn thi Giải tích 2')).toBe(true)
        expect(sameTyped('Đề cương', 'de cuong')).toBe(true)
    })

    it('refuses another name', () => {
        expect(sameTyped('Ôn thi Giải tích', 'Ôn thi Giải tích 2')).toBe(false)
    })
})

describe('toastName (C-16)', () => {
    it('keeps a name of 24 characters, and cuts a longer one with "…"', () => {
        expect(toastName('Ôn thi Giải tích 2')).toBe('Ôn thi Giải tích 2')
        expect(toastName('x'.repeat(24))).toBe('x'.repeat(24))
        expect(toastName('Câu lạc bộ Ôn thi Giải tích 2')).toBe('Câu lạc bộ Ôn thi Giải t…')
    })
})

describe('ownedServers (10 S-ME-03, REQ-AUTH-09)', () => {
    const one = (id: string, isOwner: boolean, memberCount: number) => ({ id, name: id, isOwner, memberCount })

    it('sorts the ones they own: with others in to hand over, only them to go with the account', () => {
        const owned = ownedServers([one('ot', true, 13), one('nd', false, 6), one('solo', true, 1), one('mb', true, 2)])
        expect(owned.blocking.map((server) => server.id)).toEqual(['ot', 'mb'])
        expect(owned.alone).toEqual([{ id: 'solo', name: 'solo', memberCount: 1 }])
    })

    it('finds none when they own none', () => {
        expect(ownedServers([one('nd', false, 6)])).toEqual({ blocking: [], alone: [] })
    })
})

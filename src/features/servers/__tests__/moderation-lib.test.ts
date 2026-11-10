import { describe, expect, it } from 'vitest'
import { assignableRoles, endsAt, hasActions, heldRoles, isTimedOut, pageButtons, rowActions } from '../lib/moderation'
import type { Role, Server, ServerMember } from '../types'

const bits = (...positions: number[]) => String(positions.reduce((all, bit) => all | (1n << BigInt(bit)), 0n))
const ADMINISTRATOR = 0
const MANAGE_ROLES = 2
const KICK = 4
const BAN = 5
const MODERATE = 6

const NOW = new Date('2026-11-10T09:00:00Z')

/** ÔT: Quản trị (ADMINISTRATOR) 3, Trưởng nhóm 2, Nhóm tài liệu 1. */
const serverRoles: Server['roles'] = [
    { id: 'admin', name: 'Quản trị', position: 3, administrator: true },
    { id: 'lead', name: 'Trưởng nhóm', position: 2, administrator: false },
    { id: 'docs', name: 'Nhóm tài liệu', position: 1, administrator: false }
]

const viewer = (permissions: string, topRolePosition: number, isOwner = false) => ({
    isOwner,
    topRolePosition,
    permissions,
    roles: serverRoles
})

const member = (userId: string, roleIds: string[] = [], extra: Partial<ServerMember> = {}): ServerMember => ({
    userId,
    username: userId,
    displayName: userId,
    avatarUrl: null,
    isOwner: false,
    roleIds,
    joinedAt: NOW.toISOString(),
    timeoutUntil: null,
    timeoutReason: null,
    ...extra
})

const role = (id: string, position: number, permissions = '0'): Role => ({
    id,
    name: id,
    position,
    permissions,
    mentionable: false,
    isEveryone: false,
    memberCount: 0
})

describe('rowActions (04 › Menu ⋯)', () => {
    const binh = viewer(bits(KICK, MODERATE), 2)

    it('offers what their bits allow on someone ranked below', () => {
        expect(rowActions(binh, member('dung'), NOW)).toEqual({
            timeout: true,
            endTimeout: false,
            kick: true,
            ban: false
        })
        expect(rowActions(viewer(bits(BAN), 2), member('dung'), NOW).ban).toBe(true)
    })

    it('offers nothing on themselves, an equal, a higher one or the owner', () => {
        for (const target of [
            member('binh', ['lead']),
            member('chi', ['lead']),
            member('tuan', ['admin']),
            member('an', [], { isOwner: true })
        ]) {
            expect(hasActions(rowActions(binh, target, NOW))).toBe(false)
        }
    })

    it('lets the owner act on an administrator, but never time them out (D-147)', () => {
        const actions = rowActions(viewer(bits(KICK, BAN, MODERATE), 0, true), member('tuan', ['admin']), NOW)
        expect(actions).toMatchObject({ timeout: false, kick: true, ban: true })
    })

    it('offers to end a timeout only while it runs', () => {
        const running = member('dung', [], { timeoutUntil: '2026-11-10T10:00:00Z' })
        const over = member('dung', [], { timeoutUntil: '2026-11-10T08:00:00Z' })
        expect(rowActions(binh, running, NOW)).toMatchObject({ timeout: true, endTimeout: true })
        expect(rowActions(binh, over, NOW).endTimeout).toBe(false)
        expect(isTimedOut(running, NOW)).toBe(true)
        expect(isTimedOut(over, NOW)).toBe(false)
    })
})

describe('assignableRoles (04 › "+")', () => {
    const roles = [
        role('admin', 3, bits(ADMINISTRATOR)),
        role('lead', 2, bits(MANAGE_ROLES)),
        role('docs', 1),
        // Below Bình, but carrying a bit he lacks (D-148).
        role('kickers', 1, bits(KICK)),
        { ...role('everyone', 0), isEveryone: true }
    ]

    it('lists roles below their own whose bits they hold, never @everyone', () => {
        const binh = viewer(bits(MANAGE_ROLES), 2)
        expect(assignableRoles(binh, 'binh', member('dung'), roles).map((r) => r.id)).toEqual(['docs'])
        // Themselves too (D-153).
        expect(assignableRoles(binh, 'binh', member('binh', ['lead']), roles).map((r) => r.id)).toEqual(['docs'])
    })

    it('lists every role for the owner', () => {
        // The backend sends the owner every bit.
        const an = viewer(bits(ADMINISTRATOR, MANAGE_ROLES, KICK, BAN, MODERATE), 0, true)
        expect(assignableRoles(an, 'an', member('dung'), roles).map((r) => r.id)).toEqual([
            'admin',
            'lead',
            'docs',
            'kickers'
        ])
    })

    it('lists none on someone level with or above them, or without MANAGE_ROLES', () => {
        const binh = viewer(bits(MANAGE_ROLES), 2)
        expect(assignableRoles(binh, 'binh', member('chi', ['lead']), roles)).toEqual([])
        expect(assignableRoles(viewer(bits(KICK), 2), 'binh', member('dung'), roles)).toEqual([])
    })
})

describe('heldRoles', () => {
    it('gives the member’s roles highest first', () => {
        expect(heldRoles(member('x', ['docs', 'admin']), serverRoles).map((r) => r.id)).toEqual(['admin', 'docs'])
    })
})

describe('pageButtons (C-40)', () => {
    it('shows every page up to seven', () => {
        expect(pageButtons(1, 3)).toEqual([1, 2, 3])
        expect(pageButtons(2, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it('shows the first, the last and the current with its neighbours, gaps between', () => {
        expect(pageButtons(1, 14)).toEqual([1, 2, 3, 4, 5, 'gap', 14])
        expect(pageButtons(7, 14)).toEqual([1, 'gap', 6, 7, 8, 'gap', 14])
        expect(pageButtons(14, 14)).toEqual([1, 'gap', 10, 11, 12, 13, 14])
    })
})

describe('endsAt (04 Q8)', () => {
    it('gives the time alone today, and the day too otherwise, in the account’s zone', () => {
        const zone = 'Asia/Ho_Chi_Minh'
        expect(endsAt(new Date('2026-11-10T10:00:00Z'), NOW, 'vi', zone)).toEqual({ time: '17:00', date: null })
        expect(endsAt(new Date('2026-11-11T10:00:00Z'), NOW, 'vi', zone)).toEqual({ time: '17:00', date: '11/11' })
        // 23:30 in Hồ Chí Minh is already tomorrow.
        expect(endsAt(new Date('2026-11-10T17:30:00Z'), NOW, 'vi', zone).date).toBe('11/11')
    })
})

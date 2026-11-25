import { describe, expect, it } from 'vitest'
import { profileModeration, sharedServers } from '../lib/profile-card'
import type { Server, ServerMember } from '../types'

const bits = (...positions: number[]) => String(positions.reduce((all, bit) => all | (1n << BigInt(bit)), 0n))
const KICK = 4
const BAN = 5
const MODERATE = 6
const NOW = new Date('2026-11-25T09:00:00Z')

const roles: Server['roles'] = [
    { id: 'lead', name: 'Trưởng nhóm', position: 2, administrator: false },
    { id: 'docs', name: 'Nhóm tài liệu', position: 1, administrator: false }
]
const viewer = (permissions: string, topRolePosition: number, isOwner = false) => ({
    isOwner,
    topRolePosition,
    permissions,
    roles
})
const member = (roleIds: string[] = [], extra: Partial<ServerMember> = {}): ServerMember => ({
    userId: 'phong',
    status: 'online',
    username: 'phong.vu',
    displayName: 'Phong',
    avatarUrl: null,
    isOwner: false,
    roleIds,
    joinedAt: '2026-10-05T00:00:00Z',
    timeoutUntil: null,
    timeoutReason: null,
    activity: null,
    ...extra
})

describe('sharedServers (09 profile-popover)', () => {
    it('names three servers, the rest as how many more', () => {
        expect(sharedServers(['a', 'b'])).toEqual({ shown: ['a', 'b'], more: 0 })
        expect(sharedServers(['a', 'b', 'c'])).toEqual({ shown: ['a', 'b', 'c'], more: 0 })
        expect(sharedServers(['a', 'b', 'c', 'd', 'e'])).toEqual({ shown: ['a', 'b', 'c'], more: 2 })
    })
})

describe('profileModeration (D-253: the Members row menu, no transfer)', () => {
    it('offers each item by its permission, on someone ranked below', () => {
        expect(profileModeration(viewer(bits(MODERATE, KICK, BAN), 2), member(['docs']), NOW)).toEqual([
            'timeout',
            'kick',
            'ban'
        ])
        expect(profileModeration(viewer(bits(KICK), 2), member(), NOW)).toEqual(['kick'])
    })

    it('offers nothing on someone level or above, nor on the owner', () => {
        expect(profileModeration(viewer(bits(MODERATE, KICK, BAN), 2), member(['lead']), NOW)).toEqual([])
        expect(profileModeration(viewer(bits(MODERATE, KICK, BAN), 2), member([], { isOwner: true }), NOW)).toEqual([])
    })

    it('changes or ends a running timeout', () => {
        const timedOut = member([], { timeoutUntil: '2026-11-25T10:00:00Z' })
        expect(profileModeration(viewer(bits(MODERATE), 2), timedOut, NOW)).toEqual(['changeTimeout', 'endTimeout'])
    })

    it('never offers transferring the server, even to its owner', () => {
        expect(profileModeration(viewer('0', 0, true), member(), NOW)).toEqual([])
    })
})

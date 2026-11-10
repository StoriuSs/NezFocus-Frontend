import { describe, expect, it } from 'vitest'
import { can } from '../lib/permissions'
import {
    fixedAtTop,
    holdsAllOf,
    mayChangeMember,
    moved,
    PERMISSION_GROUPS,
    reordered,
    roleLock,
    roleNamed,
    roleNameProblem,
    rolesHighestFirst,
    withPermission
} from '../lib/roles'
import type { Role } from '../types'

const role = (id: string, position: number, permissions = '0', extra: Partial<Role> = {}): Role => ({
    id,
    name: id,
    position,
    permissions,
    mentionable: false,
    isEveryone: false,
    memberCount: 0,
    ...extra
})

/** Quản trị 3, Trưởng nhóm 2, Nhóm tài liệu 1, @everyone 0. */
const roles = [
    role('docs', 1),
    role('everyone', 0, '0', { isEveryone: true, name: '@everyone' }),
    role('admin', 3, '1'),
    role('lead', 2, '4', { name: 'Trưởng nhóm' })
]
const owner = { isOwner: true, topRolePosition: 0 }
/** Bình holds Trưởng nhóm. */
const binh = { isOwner: false, topRolePosition: 2 }

describe('roles lib (S-SET-02)', () => {
    it('lists the 22 permissions of appendix B once each, in five groups', () => {
        const all = PERMISSION_GROUPS.flatMap((group) => group.permissions)
        expect(all).toHaveLength(22)
        expect(new Set(all).size).toBe(22)
        expect(PERMISSION_GROUPS.map((group) => group.id)).toEqual(['general', 'members', 'messages', 'rooms', 'tasks'])
    })

    it('turns one permission on or off, leaving the others', () => {
        const on = withPermission('256', 'SEND_MESSAGES', true)
        expect(can(on, 'SEND_MESSAGES') && can(on, 'VIEW_CHANNEL')).toBe(true)
        expect(withPermission(on, 'SEND_MESSAGES', false)).toBe('256')
        expect(withPermission('256', 'VIEW_CHANNEL', true)).toBe('256')
    })

    it('needs every bit of a role to hand it out (D-148)', () => {
        expect(holdsAllOf('7', role('r', 1, '5'))).toBe(true)
        expect(holdsAllOf('4', role('r', 1, '5'))).toBe(false)
    })

    it('orders roles highest first without @everyone', () => {
        expect(rolesHighestFirst(roles).map((r) => r.id)).toEqual(['admin', 'lead', 'docs'])
    })

    it('locks their own highest role and those above it, never for the owner', () => {
        const [admin, lead, docs] = rolesHighestFirst(roles)
        expect([admin, lead, docs].map((r) => roleLock(binh, r!))).toEqual(['above', 'mine', null])
        expect(roleLock(owner, admin!)).toBeNull()
        // Holding no role, they rank with @everyone: every role is above, @everyone too.
        const nobody = { isOwner: false, topRolePosition: 0 }
        expect(roleLock(nobody, docs!)).toBe('above')
        expect(roleLock(nobody, roles[1]!)).toBe('above')
        expect(fixedAtTop(binh, rolesHighestFirst(roles))).toBe(2)
        expect(fixedAtTop(owner, rolesHighestFirst(roles))).toBe(0)
    })

    it('lets them change themselves and those ranked below, not the owner or a peer', () => {
        const member = (userId: string, roleIds: string[], isOwner = false) => ({ userId, roleIds, isOwner })
        expect(mayChangeMember(binh, 'binh', member('binh', ['lead']), roles)).toBe(true)
        expect(mayChangeMember(binh, 'binh', member('chi', ['docs']), roles)).toBe(true)
        expect(mayChangeMember(binh, 'binh', member('ha', ['lead']), roles)).toBe(false)
        expect(mayChangeMember(binh, 'binh', member('an', [], true), roles)).toBe(false)
        expect(mayChangeMember(owner, 'an', member('tuan', ['admin']), roles)).toBe(true)
    })

    it('moves one id and gives the new order its positions', () => {
        expect(moved(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
        expect(moved(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a'])
        const after = reordered(roles, ['lead', 'admin', 'docs'])
        expect(rolesHighestFirst(after).map((r) => [r.id, r.position])).toEqual([
            ['lead', 3],
            ['admin', 2],
            ['docs', 1]
        ])
        expect(after.find((r) => r.isEveryone)?.position).toBe(0)
    })

    it('refuses names the backend refuses, before asking (Q5)', () => {
        expect(roleNameProblem('  ')).toBe('length')
        expect(roleNameProblem('x'.repeat(101))).toBe('length')
        expect(roleNameProblem('@Everyone')).toBe('reserved')
        expect(roleNameProblem('here')).toBe('reserved')
        expect(roleNameProblem('Nhóm đề')).toBeNull()
        expect(roleNamed(roles, ' trưởng NHÓM ')?.id).toBe('lead')
        expect(roleNamed(roles, 'truong nhom')).toBeUndefined()
        expect(roleNamed(roles, 'Trưởng nhóm', 'lead')).toBeUndefined()
    })
})

import { describe, expect, it } from 'vitest'
import { chatPermissions } from '../lib/chat-permissions'
import { permissionBit, type PermissionName } from '../lib/permissions'

const NOW = new Date('2026-10-18T14:47:00Z')
const bits = (...names: PermissionName[]) => names.reduce((all, name) => all | permissionBit(name), 0n).toString()
const free = { timeoutUntil: null }
const timedOut = { timeoutUntil: '2026-10-18T15:30:00Z' }

describe('What the chat may offer, from the channel’s bits (REQ-MSG-05, SRS 1.70)', () => {
    it('gives a member reply and edit, and deleting their own messages', () => {
        expect(chatPermissions(free, { permissions: bits('VIEW_CHANNEL', 'SEND_MESSAGES') }, NOW)).toEqual({
            send: true,
            manage: false,
            deleteOwn: true
        })
    })

    it('keeps deleting one’s own in a channel only managers may post in', () => {
        expect(chatPermissions(free, { permissions: bits('VIEW_CHANNEL') }, NOW)).toEqual({
            send: false,
            manage: false,
            deleteOwn: true
        })
    })

    it('leaves someone timed out nothing, until the timeout ends', () => {
        const viewOnly = { permissions: bits('VIEW_CHANNEL') }
        expect(chatPermissions(timedOut, viewOnly, NOW)).toEqual({ send: false, manage: false, deleteOwn: false })
        expect(chatPermissions(timedOut, viewOnly, new Date('2026-10-18T15:31:00Z')).deleteOwn).toBe(true)
    })

    it('gives MANAGE_MESSAGES deleting anyone’s message', () => {
        expect(chatPermissions(free, { permissions: bits('VIEW_CHANNEL', 'MANAGE_MESSAGES') }, NOW).manage).toBe(true)
    })
})

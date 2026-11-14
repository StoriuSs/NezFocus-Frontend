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
            deleteOwn: true,
            react: true,
            addReactions: false,
            mentionEveryone: false
        })
    })

    it('keeps deleting one’s own in a channel only managers may post in', () => {
        expect(chatPermissions(free, { permissions: bits('VIEW_CHANNEL') }, NOW)).toEqual({
            send: false,
            manage: false,
            deleteOwn: true,
            react: true,
            addReactions: false,
            mentionEveryone: false
        })
    })

    it('leaves someone timed out nothing, until the timeout ends', () => {
        const viewOnly = { permissions: bits('VIEW_CHANNEL') }
        expect(chatPermissions(timedOut, viewOnly, NOW)).toEqual({
            send: false,
            manage: false,
            deleteOwn: false,
            react: false,
            addReactions: false,
            mentionEveryone: false
        })
        expect(chatPermissions(timedOut, viewOnly, new Date('2026-10-18T15:31:00Z'))).toMatchObject({
            deleteOwn: true,
            react: true
        })
    })

    it('gives MANAGE_MESSAGES deleting anyone’s message', () => {
        expect(chatPermissions(free, { permissions: bits('VIEW_CHANNEL', 'MANAGE_MESSAGES') }, NOW).manage).toBe(true)
    })

    it('gives ADD_REACTIONS new emoji; without it, only those already on a message (SRS 1.71)', () => {
        expect(chatPermissions(free, { permissions: bits('VIEW_CHANNEL', 'ADD_REACTIONS') }, NOW)).toMatchObject({
            react: true,
            addReactions: true
        })
    })

    it('lets a timed out moderator keep reacting, as the server does (appendix B, step 1)', () => {
        const moderator = { permissions: bits('VIEW_CHANNEL', 'MANAGE_MESSAGES', 'ADD_REACTIONS') }
        expect(chatPermissions(timedOut, moderator, NOW)).toMatchObject({ react: true, addReactions: true })
    })

    it('gives MENTION_EVERYONE @everyone and any role (REQ-MSG-03)', () => {
        expect(
            chatPermissions(free, { permissions: bits('VIEW_CHANNEL', 'MENTION_EVERYONE') }, NOW).mentionEveryone
        ).toBe(true)
        expect(chatPermissions(free, { permissions: bits('VIEW_CHANNEL') }, NOW).mentionEveryone).toBe(false)
    })
})

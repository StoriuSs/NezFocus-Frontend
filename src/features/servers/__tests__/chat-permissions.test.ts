import { describe, expect, it } from 'vitest'
import { chatPermissions } from '../lib/chat-permissions'
import { permissionBit, type PermissionName } from '../lib/permissions'

const NOW = new Date('2026-10-18T14:47:00Z')
const bits = (...names: PermissionName[]) => names.reduce((all, name) => all | permissionBit(name), 0n).toString()
const free = { timeoutUntil: null }
const timedOut = { timeoutUntil: '2026-10-18T15:30:00Z' }

describe('What the chat may offer, from the channel’s bits (REQ-MSG-05, SRS 1.70)', () => {
    it('gives a member reply and edit, and deleting their own messages', () => {
        expect(
            chatPermissions(
                free,
                { permissions: bits('VIEW_CHANNEL', 'SEND_MESSAGES'), sendMode: 'everyone' as const },
                NOW
            )
        ).toEqual({
            send: true,
            sendBlocked: null,
            manage: false,
            deleteOwn: true,
            react: true,
            addReactions: false,
            mentionEveryone: false,
            attachFiles: false
        })
    })

    it('keeps deleting one’s own in a channel only managers may post in', () => {
        expect(chatPermissions(free, { permissions: bits('VIEW_CHANNEL'), sendMode: 'managers' }, NOW)).toEqual({
            send: false,
            sendBlocked: { reason: 'managers-only' },
            manage: false,
            deleteOwn: true,
            react: true,
            addReactions: false,
            mentionEveryone: false,
            attachFiles: false
        })
    })

    it('leaves someone timed out nothing, until the timeout ends', () => {
        const viewOnly = { permissions: bits('VIEW_CHANNEL'), sendMode: 'everyone' as const }
        expect(chatPermissions(timedOut, viewOnly, NOW)).toEqual({
            send: false,
            sendBlocked: { reason: 'timed-out', until: '2026-10-18T15:30:00Z' },
            manage: false,
            deleteOwn: false,
            react: false,
            addReactions: false,
            mentionEveryone: false,
            attachFiles: false
        })
        expect(chatPermissions(timedOut, viewOnly, new Date('2026-10-18T15:31:00Z'))).toMatchObject({
            deleteOwn: true,
            react: true
        })
    })

    it('gives MANAGE_MESSAGES deleting anyone’s message', () => {
        expect(
            chatPermissions(
                free,
                { permissions: bits('VIEW_CHANNEL', 'MANAGE_MESSAGES'), sendMode: 'everyone' as const },
                NOW
            ).manage
        ).toBe(true)
    })

    it('gives ADD_REACTIONS new emoji; without it, only those already on a message (SRS 1.71)', () => {
        expect(
            chatPermissions(
                free,
                { permissions: bits('VIEW_CHANNEL', 'ADD_REACTIONS'), sendMode: 'everyone' as const },
                NOW
            )
        ).toMatchObject({
            react: true,
            addReactions: true
        })
    })

    it('lets a timed out moderator keep reacting, as the server does (appendix B, step 1)', () => {
        const moderator = {
            permissions: bits('VIEW_CHANNEL', 'MANAGE_MESSAGES', 'ADD_REACTIONS'),
            sendMode: 'everyone' as const
        }
        expect(chatPermissions(timedOut, moderator, NOW)).toMatchObject({ react: true, addReactions: true })
    })

    it('gives MENTION_EVERYONE @everyone and any role (REQ-MSG-03)', () => {
        expect(
            chatPermissions(
                free,
                { permissions: bits('VIEW_CHANNEL', 'MENTION_EVERYONE'), sendMode: 'everyone' as const },
                NOW
            ).mentionEveryone
        ).toBe(true)
        expect(
            chatPermissions(free, { permissions: bits('VIEW_CHANNEL'), sendMode: 'everyone' as const }, NOW)
                .mentionEveryone
        ).toBe(false)
    })

    it('offers files with SEND_MESSAGES and ATTACH_FILES only, and none while timed out (REQ-ROLE-03)', () => {
        const both = {
            permissions: bits('VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES'),
            sendMode: 'everyone' as const
        }
        expect(chatPermissions(free, both, NOW).attachFiles).toBe(true)
        expect(
            chatPermissions(
                free,
                { permissions: bits('VIEW_CHANNEL', 'ATTACH_FILES'), sendMode: 'everyone' as const },
                NOW
            ).attachFiles
        ).toBe(false)
        expect(
            chatPermissions(
                free,
                { permissions: bits('VIEW_CHANNEL', 'SEND_MESSAGES'), sendMode: 'everyone' as const },
                NOW
            ).attachFiles
        ).toBe(false)
    })

    it('says why the composer is shut: a timeout first, then a channel only managers post in, else the server (C-12 disabled)', () => {
        const managersOnly = { permissions: bits('VIEW_CHANNEL'), sendMode: 'managers' as const }
        expect(chatPermissions(timedOut, managersOnly, NOW).sendBlocked).toEqual({
            reason: 'timed-out',
            until: '2026-10-18T15:30:00Z'
        })
        expect(chatPermissions(free, managersOnly, NOW).sendBlocked).toEqual({ reason: 'managers-only' })
        expect(
            chatPermissions(free, { permissions: bits('VIEW_CHANNEL'), sendMode: 'everyone' }, NOW).sendBlocked
        ).toEqual({ reason: 'no-permission' })
        // Past its end by this clock, the server not read again yet (or the API's clock behind): still the timeout.
        expect(chatPermissions(timedOut, managersOnly, new Date('2026-10-18T15:31:00Z')).sendBlocked).toEqual({
            reason: 'timed-out',
            until: '2026-10-18T15:30:00Z'
        })
        // Read again, the timeout gone: the channel is what shuts it.
        expect(
            chatPermissions({ timeoutUntil: null }, managersOnly, new Date('2026-10-18T15:31:00Z')).sendBlocked
        ).toEqual({ reason: 'managers-only' })
        // The owner or an ADMINISTRATOR timed out still posts: nothing to say.
        const owner = {
            permissions: bits('VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_MESSAGES'),
            sendMode: 'managers' as const
        }
        expect(chatPermissions(timedOut, owner, NOW).sendBlocked).toBeNull()
    })
})

import { describe, expect, it } from 'vitest'
import { allowedActions } from '../lib/message-permissions'
import type { ChatPermissions, Message } from '../types'

const message = (authorId: string): Message => ({
    id: 'm1',
    channelId: 'hoi-dap',
    type: 'regular',
    author: { id: authorId, username: authorId, displayName: authorId, avatarUrl: null },
    content: 'Câu 3?',
    mentionUsers: [],
    mentionRoles: [],
    mentionEveryone: false,
    systemEvent: null,
    systemData: null,
    systemUser: null,
    pinned: false,
    reactions: [],
    replyTo: null,
    editedAt: null,
    createdAt: '2026-10-18T13:02:00.000Z'
})

const MEMBER: ChatPermissions = {
    send: true,
    manage: false,
    deleteOwn: true,
    react: true,
    addReactions: true,
    mentionEveryone: false
}
const MANAGERS_ONLY: ChatPermissions = {
    send: false,
    manage: false,
    deleteOwn: true,
    react: true,
    addReactions: true,
    mentionEveryone: false
}
const TIMED_OUT: ChatPermissions = {
    send: false,
    manage: false,
    deleteOwn: false,
    react: false,
    addReactions: false,
    mentionEveryone: false
}
const MODERATOR: ChatPermissions = {
    send: true,
    manage: true,
    deleteOwn: true,
    react: true,
    addReactions: true,
    mentionEveryone: false
}

describe('What one may do to a message (REQ-MSG-05, SRS 1.70)', () => {
    it("lets a member edit, reply to and delete their own message, only reply to someone else's", () => {
        expect(allowedActions('an', MEMBER, message('an'))).toEqual({
            own: true,
            edit: true,
            reply: true,
            delete: true,
            react: true,
            pin: false,
            unpin: false
        })
        expect(allowedActions('an', MEMBER, message('tuan'))).toEqual({
            own: false,
            edit: false,
            reply: true,
            delete: false,
            react: true,
            pin: false,
            unpin: false
        })
    })

    it('lets the author delete but not edit in a channel only managers may post in', () => {
        expect(allowedActions('an', MANAGERS_ONLY, message('an'))).toMatchObject({
            edit: false,
            reply: false,
            delete: true
        })
    })

    it('leaves a timed-out author neither edit nor delete', () => {
        expect(allowedActions('an', TIMED_OUT, message('an'))).toMatchObject({
            edit: false,
            reply: false,
            delete: false
        })
    })

    it("lets MANAGE_MESSAGES delete anyone's message, never edit it", () => {
        expect(allowedActions('an', MODERATOR, message('tuan'))).toMatchObject({ edit: false, delete: true })
    })

    it('gives nothing of "own" before the profile is known', () => {
        expect(allowedActions(undefined, MEMBER, message('an')).own).toBe(false)
    })

    it('offers "Add reaction" only with ADD_REACTIONS (C-11)', () => {
        expect(allowedActions('an', { ...MEMBER, addReactions: false }, message('tuan')).react).toBe(false)
        expect(allowedActions('an', TIMED_OUT, message('tuan')).react).toBe(false)
    })

    it('offers MANAGE_MESSAGES "Pin", or "Unpin" once pinned (REQ-MSG-07)', () => {
        expect(allowedActions('an', MODERATOR, message('tuan'))).toMatchObject({ pin: true, unpin: false })
        expect(allowedActions('an', MODERATOR, { ...message('tuan'), pinned: true })).toMatchObject({
            pin: false,
            unpin: true
        })
        expect(allowedActions('an', MEMBER, { ...message('tuan'), pinned: true }).unpin).toBe(false)
    })
})

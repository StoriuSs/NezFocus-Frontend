import { describe, expect, it } from 'vitest'
import { changesOf, settingsOf } from '../lib/channel-settings'
import type { Server, ServerChannel } from '../types'

/** VIEW_CHANNEL, CONNECT, MANAGE_STUDY_ROOMS: no MANAGE_CHANNELS. */
const STUDY_ONLY = String((1n << 8n) | (1n << 15n) | (1n << 20n))
const MANAGER = String((1n << 8n) | (1n << 15n) | (1n << 3n))

const room = (permissions: string): ServerChannel => ({
    id: 'phong',
    categoryId: null,
    type: 'voice',
    name: 'Phòng học im lặng',
    position: 0,
    isPrivate: true,
    sendMode: 'everyone',
    isStudyRoom: true,
    studyStarter: 'anyone',
    studyFocusMinutes: 25,
    studyShortBreakMinutes: 5,
    studyLongBreakMinutes: null,
    studyLongBreakEvery: null,
    taskBoardEnabled: false,
    permissions,
    viewRoleIds: ['lead'],
    voiceStates: null,
    focusSession: null
})

const server = { roles: [{ id: 'lead', name: 'Trưởng nhóm', position: 1, administrator: false }] } as Server

describe('what Room settings sends (S-SET-06, D-210)', () => {
    it('sends only the study part for someone who manages study rooms only: a private room without its roles sends no roles', () => {
        // The roles of a private room are not sent to them (null): the form starts with none ticked.
        const channel = { ...room(STUDY_ONLY), viewRoleIds: null }
        expect(changesOf(server, channel, { ...settingsOf(channel), studyStarter: 'managers' })).toEqual({
            studyStarter: 'managers'
        })
    })

    it('sends a change of the rest whoever made it: the API refuses what they may not change (D-210)', () => {
        const values = { ...settingsOf(room(MANAGER)), name: 'Phòng khác', isPrivate: false }
        expect(changesOf(server, room(STUDY_ONLY), values)).toEqual({ name: 'Phòng khác', isPrivate: false })
    })

    it('sends a changed half of the long break alone: the API merges it with the other', () => {
        const channel = { ...room(MANAGER), studyLongBreakMinutes: 20, studyLongBreakEvery: 3 }
        const values = settingsOf(channel)
        expect(changesOf(server, channel, { ...values, cycle: { ...values.cycle, longBreakEvery: '4' } })).toEqual({
            studyLongBreakEvery: 4
        })
    })
})

import '@/i18n/servers'
import * as z from 'zod'
import type { TFunction } from 'i18next'
import { storedName } from './channel-layout'
import { nameError } from './layout-messages'
import { addCycleIssues, chosenCycle, cycleFormOf, cycleFormSchema, cycleOf } from '@/features/study'
import type { Server, ServerChannel, UpdateChannelRequest } from '../types'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * The form of "Channel settings" / "Room settings" (S-SET-05, S-SET-06). A
 * new name is checked against the server as it is now; the name kept is not
 * checked again. The cycle of a study room is checked only while it is shown:
 * the room a study room, on Custom, the long break's fields while its switch
 * is on (C-22: when Save is pressed). A cycle field's error message is the
 * field's name, put into words where it shows.
 */
export const createChannelSettingsSchema = (t: TFunction<'servers'>, server: Server, channel: ServerChannel) =>
    z
        .object({
            name: z.string(),
            sendMode: z.custom<ServerChannel['sendMode']>(),
            isPrivate: z.boolean(),
            viewRoleIds: z.array(z.string()),
            taskBoardEnabled: z.boolean(),
            isStudyRoom: z.boolean(),
            studyStarter: z.custom<ServerChannel['studyStarter']>(),
            cycle: cycleFormSchema
        })
        .superRefine((values, ctx) => {
            if (channel.type === 'voice' && values.isStudyRoom) addCycleIssues(values.cycle, ctx, ['cycle'])
            if (storedName(channel.type, values.name) === channel.name) return
            const message = nameError(t, server, channel.type, values.name, channel.categoryId ?? null, channel.id)
            if (message) ctx.addIssue({ code: 'custom', path: ['name'], message })
        })

export type ChannelSettingsValues = z.infer<ReturnType<typeof createChannelSettingsSchema>>

/** The form as the channel is now. */
export const settingsOf = (channel: ServerChannel): ChannelSettingsValues => ({
    name: channel.name,
    sendMode: channel.sendMode,
    isPrivate: channel.isPrivate,
    viewRoleIds: channel.viewRoleIds ?? [],
    taskBoardEnabled: channel.taskBoardEnabled,
    isStudyRoom: channel.isStudyRoom,
    studyStarter: channel.studyStarter,
    cycle: cycleFormOf(cycleOf(channel))
})

/**
 * Only what differs from the channel goes out. Someone who may change a
 * room's study part only (`MANAGE_STUDY_ROOMS` without `MANAGE_CHANNELS`,
 * D-210) cannot edit the rest, so it never differs; a change made before that
 * right went is sent all the same, for the API to refuse and the dialog to
 * say so, rather than dropped without a word. A room that stops being a
 * study room sends that alone: what is hidden under the switch is neither
 * checked nor sent.
 */
export function changesOf(server: Server, channel: ServerChannel, values: ChannelSettingsValues): UpdateChannelRequest {
    const changes: UpdateChannelRequest = {}
    if (storedName(channel.type, values.name) !== channel.name) changes.name = values.name
    if (values.sendMode !== channel.sendMode) changes.sendMode = values.sendMode
    if (values.isPrivate !== channel.isPrivate) changes.isPrivate = values.isPrivate
    if (values.taskBoardEnabled !== channel.taskBoardEnabled) changes.taskBoardEnabled = values.taskBoardEnabled
    const rolesToSend = values.viewRoleIds.filter((id) => server.roles.some((r) => r.id === id && !r.administrator))
    if (values.isPrivate && !sameSet(rolesToSend, channel.viewRoleIds ?? [])) changes.viewRoleIds = rolesToSend
    if (channel.type !== 'voice') return changes

    if (values.isStudyRoom !== channel.isStudyRoom) changes.isStudyRoom = values.isStudyRoom
    if (!values.isStudyRoom) return changes
    if (values.studyStarter !== channel.studyStarter) changes.studyStarter = values.studyStarter
    const cycle = chosenCycle(values.cycle)
    if (!cycle) return changes
    if (cycle.focus !== channel.studyFocusMinutes) changes.studyFocusMinutes = cycle.focus
    if (cycle.shortBreak !== channel.studyShortBreakMinutes) changes.studyShortBreakMinutes = cycle.shortBreak
    if (cycle.longBreak !== channel.studyLongBreakMinutes) changes.studyLongBreakMinutes = cycle.longBreak
    if (cycle.longBreakEvery !== channel.studyLongBreakEvery) changes.studyLongBreakEvery = cycle.longBreakEvery
    return changes
}

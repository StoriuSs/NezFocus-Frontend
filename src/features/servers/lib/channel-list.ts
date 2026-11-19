import { Hash, LampDesk, Volume2, type LucideIcon } from 'lucide-react'
import type { Server, ServerCategory, ServerChannel } from '../types'

/**
 * A channel's icon (C-06): `hash` for a text channel, `lamp-desk` for a study
 * room, `volume-2` for any other voice room. Here rather than with the rows:
 * the room page and the inbox use it too, without the channel list's drag code.
 */
export const channelIcon = (channel: Pick<ServerChannel, 'type' | 'isStudyRoom'>): LucideIcon =>
    channel.type === 'text' ? Hash : channel.isStudyRoom ? LampDesk : Volume2

export interface ChannelGroup {
    /** Null: the channels above the first category, with no heading. */
    category: ServerCategory | null
    channels: ServerChannel[]
}

/**
 * The channel list's order (C-06): the channels outside any category first,
 * then each category with its channels, everything by position. A category
 * comes even when empty: the API sends one only to who may see it.
 */
export function channelGroups(server: Pick<Server, 'categories' | 'channels'>): ChannelGroup[] {
    const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position
    const inGroup = (categoryId: string | null) =>
        server.channels.filter((channel) => (channel.categoryId ?? null) === categoryId).sort(byPosition)

    const loose = inGroup(null)
    return [
        ...(loose.length > 0 ? [{ category: null, channels: loose }] : []),
        ...[...server.categories].sort(byPosition).map((category) => ({ category, channels: inGroup(category.id) }))
    ]
}

/** Where opening a server lands (02 S-SHELL-01): its first text channel in list order. */
export function firstTextChannel(server: Pick<Server, 'categories' | 'channels'>): ServerChannel | undefined {
    return channelGroups(server)
        .flatMap((group) => group.channels)
        .find((channel) => channel.type === 'text')
}

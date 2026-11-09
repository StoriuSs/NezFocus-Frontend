import type { Server } from '../types'
import { groupChannels, type ChannelSlot } from './channel-layout'

/*
 * Where a drag over the channel list would drop (S-SRV-06): from the row it
 * is over and whether its middle is past that row's middle. Droppable ids are
 * `ch:<channel>`, `cat:<category>` (a heading) and `top` (above everything).
 */

export const channelDropId = (id: string) => `ch:${id}`
export const categoryDropId = (id: string) => `cat:${id}`
export const TOP_DROP_ID = 'top'

const sortedCategories = (server: Pick<Server, 'categories'>) =>
    [...server.categories].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))

/** The last channel of a group, leaving out the one being dragged. */
function lastOf(server: Pick<Server, 'channels'>, categoryId: string | null, draggedId: string): string | null {
    const others = groupChannels(server, categoryId).filter((c) => c.id !== draggedId)
    return others.length > 0 ? (others[others.length - 1]?.id ?? null) : null
}

/**
 * A channel dragged over `overId`:
 * - over `top`: first of the channels outside any category;
 * - over a heading, lower half: the end of that category (folded or not); upper
 *   half: the end of the group above it (outside any category, for the first);
 * - over a channel: right after it (lower half) or right before it (upper half).
 */
export function channelDropSlot(
    server: Pick<Server, 'channels' | 'categories'>,
    draggedId: string,
    overId: string,
    below: boolean
): ChannelSlot | null {
    if (overId === TOP_DROP_ID) return { categoryId: null, afterId: null }

    if (overId.startsWith('cat:')) {
        const categoryId = overId.slice(4)
        const categories = sortedCategories(server)
        const index = categories.findIndex((c) => c.id === categoryId)
        if (index < 0) return null
        if (below) return { categoryId, afterId: lastOf(server, categoryId, draggedId) }
        const above = index === 0 ? null : (categories[index - 1]?.id ?? null)
        return { categoryId: above, afterId: lastOf(server, above, draggedId) }
    }

    const channel = server.channels.find((c) => `ch:${c.id}` === overId)
    if (!channel) return null
    const categoryId = channel.categoryId ?? null
    const others = groupChannels(server, categoryId).filter((c) => c.id !== draggedId)
    if (channel.id === draggedId) {
        // Over its own place: where it already is.
        const group = groupChannels(server, categoryId)
        const index = group.findIndex((c) => c.id === draggedId)
        return { categoryId, afterId: index > 0 ? (group[index - 1]?.id ?? null) : null }
    }
    const index = others.findIndex((c) => c.id === channel.id)
    if (below) return { categoryId, afterId: channel.id }
    return { categoryId, afterId: index > 0 ? (others[index - 1]?.id ?? null) : null }
}

/** A category dragged over another heading: right after it (lower half) or right before it. */
export function categoryDropAfter(
    server: Pick<Server, 'categories'>,
    draggedId: string,
    overId: string,
    below: boolean
): { afterId: string | null } | null {
    if (!overId.startsWith('cat:')) return null
    const others = sortedCategories(server).filter((c) => c.id !== draggedId)
    const overCategory = overId.slice(4)
    if (overCategory === draggedId) {
        const all = sortedCategories(server)
        const index = all.findIndex((c) => c.id === draggedId)
        return { afterId: index > 0 ? (all[index - 1]?.id ?? null) : null }
    }
    const index = others.findIndex((c) => c.id === overCategory)
    if (index < 0) return null
    if (below) return { afterId: overCategory }
    return { afterId: index > 0 ? (others[index - 1]?.id ?? null) : null }
}

/** The places a category may go, by keyboard: first, then after each other category. */
export function categorySlots(server: Pick<Server, 'categories'>, draggedId: string): (string | null)[] {
    return [
        null,
        ...sortedCategories(server)
            .filter((c) => c.id !== draggedId)
            .map((c) => c.id)
    ]
}

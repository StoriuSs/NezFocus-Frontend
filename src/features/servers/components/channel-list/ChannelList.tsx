import { Fragment, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    closestCenter,
    DndContext,
    DragOverlay,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
    type DragMoveEvent
} from '@dnd-kit/core'
import { useMoveInLayout } from '../../api/useChannelLayout'
import { useChannelDialogs } from '../../channel-dialogs.store'
import { useFoldedCategories } from '../../hooks/useFoldedCategories'
import { channelSlots, dropClash, groupChannels, sameSlot, slotOf, type ChannelSlot } from '../../lib/channel-layout'
import { channelGroups } from '../../lib/channel-list'
import { categoryDropAfter, categorySlots, channelDropSlot, TOP_DROP_ID } from '../../lib/drop-target'
import { channelPath } from '../../lib/paths'
import { can } from '../../lib/permissions'
import type { LayoutMove, Server, ServerCategory } from '../../types'
import { CategoryHeading, ChannelRow, channelIcon, DragPreview, DropLine } from './rows'

type Dragged = { kind: 'channel'; id: string } | { kind: 'category'; id: string }
/** Where it would go: a channel slot, or the category it would follow. */
type Target = { kind: 'channel'; slot: ChannelSlot } | { kind: 'category'; afterId: string | null }

/** Above everything: drops a channel first among those outside any category (S-SRV-06 `drop-uncategorized`). */
function TopZone({ enabled }: { enabled: boolean }) {
    const { setNodeRef } = useDroppable({ id: TOP_DROP_ID, disabled: !enabled })
    return <li ref={setNodeRef} aria-hidden='true' className='h-2' />
}

/**
 * A server's channels (C-06): those outside any category first, without a
 * heading, then each category. Whoever manages channels drags a channel to
 * another place or category, or a category among the others (S-SRV-06): the
 * list changes at once, one move goes to the API (D-149), and a refusal puts
 * it back with a Toast. From the keyboard: Space lifts, ↑ ↓ move, Space
 * drops, Esc cancels; Enter still opens.
 */
export function ChannelList({ server }: { server: Server }) {
    const { t } = useTranslation()
    const { pathname } = useLocation()
    const moveInLayout = useMoveInLayout()
    const showDialog = useChannelDialogs((state) => state.show)
    const { folded, setFolded } = useFoldedCategories(server.id)
    const [dragged, setDragged] = useState<Dragged | null>(null)
    const [target, setTarget] = useState<Target | null>(null)
    const [byKeyboard, setByKeyboard] = useState(false)
    const [announcement, setAnnouncement] = useState('')
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

    const managesServer = can(server.permissions, 'MANAGE_CHANNELS')
    const categories = [...server.categories].sort((a, b) => a.position - b.position)
    const nameOf = (item: Dragged) =>
        item.kind === 'channel'
            ? `#${server.channels.find((c) => c.id === item.id)?.name ?? ''}`
            : (server.categories.find((c) => c.id === item.id)?.name.toLocaleUpperCase('vi') ?? '')
    const draggedChannel = dragged?.kind === 'channel' ? server.channels.find((c) => c.id === dragged.id) : undefined
    const clash =
        draggedChannel && target?.kind === 'channel' ? dropClash(server, draggedChannel, target.slot) : undefined

    /** "PHÒNG HỌC đã có kênh #viec-nhom" (S-SRV-06, D-84). */
    function clashReason(categoryId: string | null, blocking: { type: string; name: string }) {
        const category = server.categories.find((c) => c.id === categoryId)?.name.toLocaleUpperCase('vi')
        const room = blocking.type === 'voice' ? 'Room' : ''
        return category
            ? t(`shell.drag.takenIn${room}`, { category, name: blocking.name })
            : t(`shell.drag.takenTop${room}`, { name: blocking.name })
    }

    function end() {
        setDragged(null)
        setTarget(null)
        setByKeyboard(false)
    }

    /** One drop: shown at once, sent, and put back if refused (useMoveInLayout). */
    const commit = (move: LayoutMove) => moveInLayout.mutate({ serverId: server.id, change: move })

    function drop(item: Dragged, at: Target | null) {
        end()
        if (!at) return setAnnouncement(t('shell.drag.cancelled', { name: nameOf(item) }))
        if (item.kind === 'channel' && at.kind === 'channel') {
            const channel = server.channels.find((c) => c.id === item.id)
            if (!channel || sameSlot(at.slot, slotOf(server, channel))) {
                return setAnnouncement(t('shell.drag.dropped', { name: nameOf(item) }))
            }
            const blocking = dropClash(server, channel, at.slot)
            if (blocking) {
                const reason = clashReason(at.slot.categoryId, blocking)
                toast.error(reason)
                return setAnnouncement(t('shell.drag.blocked', { reason }))
            }
            // Dropped into a folded category: it opens to show the channel.
            if (at.slot.categoryId) setFolded(at.slot.categoryId, false)
            commit({ kind: 'channel', id: item.id, ...at.slot })
        } else if (item.kind === 'category' && at.kind === 'category') {
            const index = categories.findIndex((c) => c.id === item.id)
            const current = index > 0 ? (categories[index - 1]?.id ?? null) : null
            if (current !== at.afterId) commit({ kind: 'category', id: item.id, afterId: at.afterId })
        }
        setAnnouncement(t('shell.drag.dropped', { name: nameOf(item) }))
    }

    // --- Pointer (dnd-kit) ---------------------------------------------------

    function onMove(event: DragMoveEvent) {
        const { active, over } = event
        if (!dragged || !over) return setTarget(null)
        const rect = active.rect.current.translated
        const below = rect ? rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 : true
        const overId = String(over.id)
        if (dragged.kind === 'channel') {
            const slot = channelDropSlot(server, dragged.id, overId, below)
            setTarget(slot ? { kind: 'channel', slot } : null)
        } else {
            const place = categoryDropAfter(server, dragged.id, overId, below)
            setTarget(place ? { kind: 'category', afterId: place.afterId } : null)
        }
    }

    // --- Keyboard ------------------------------------------------------------

    function keyboardTargets(item: Dragged): Target[] {
        return item.kind === 'channel'
            ? channelSlots(server, item.id).map((slot) => ({ kind: 'channel', slot }))
            : categorySlots(server, item.id).map((afterId) => ({ kind: 'category', afterId }))
    }

    function describe(at: Target, item: Dragged): string {
        if (at.kind === 'category') {
            const position = categorySlots(server, item.id).indexOf(at.afterId) + 1
            return t('shell.drag.at', { name: nameOf(item), place: String(position) })
        }
        const group = groupChannels(server, at.slot.categoryId).filter((c) => c.id !== item.id)
        const position = at.slot.afterId === null ? 1 : group.findIndex((c) => c.id === at.slot.afterId) + 2
        const category = server.categories.find((c) => c.id === at.slot.categoryId)
        const place = category
            ? t('shell.drag.inCategory', { category: category.name.toLocaleUpperCase('vi'), position })
            : t('shell.drag.top', { position })
        return t('shell.drag.at', { name: nameOf(item), place })
    }

    function onKey(item: Dragged, allowed: boolean) {
        return (event: KeyboardEvent) => {
            if (!allowed) return
            const lifted = byKeyboard && dragged?.kind === item.kind && dragged.id === item.id
            if (!lifted) {
                if (event.key !== ' ' || dragged) return
                event.preventDefault()
                const targets = keyboardTargets(item)
                const channel = item.kind === 'channel' ? server.channels.find((c) => c.id === item.id) : undefined
                const index = categories.findIndex((c) => c.id === item.id)
                const start: Target = channel
                    ? { kind: 'channel', slot: slotOf(server, channel) }
                    : { kind: 'category', afterId: index > 0 ? (categories[index - 1]?.id ?? null) : null }
                setDragged(item)
                setByKeyboard(true)
                setTarget(targets.find((candidate) => JSON.stringify(candidate) === JSON.stringify(start)) ?? start)
                return setAnnouncement(t('shell.drag.lifted', { name: nameOf(item) }))
            }
            if (event.key === 'Escape') {
                event.preventDefault()
                end()
                return setAnnouncement(t('shell.drag.cancelled', { name: nameOf(item) }))
            }
            if (event.key === ' ') {
                event.preventDefault()
                return drop(item, target)
            }
            const step = { ArrowUp: -1, ArrowDown: 1 }[event.key]
            if (!step || !target) return
            event.preventDefault()
            const targets = keyboardTargets(item)
            const index = targets.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(target))
            const next = targets[Math.min(targets.length - 1, Math.max(0, index + step))]
            if (!next) return
            setTarget(next)
            setAnnouncement(describe(next, item))
        }
    }

    // --- Drawing ---------------------------------------------------------------

    const line = (categoryId: string | null, afterId: string | null) =>
        target?.kind === 'channel' && target.slot.categoryId === categoryId && target.slot.afterId === afterId ? (
            <DropLine blocked={Boolean(clash)} />
        ) : null

    const channelRows = (categoryId: string | null, shown: typeof server.channels) => (
        <>
            {line(categoryId, null)}
            {shown.map((channel) => (
                <Fragment key={channel.id}>
                    <ChannelRow
                        server={server}
                        channel={channel}
                        lifted={dragged?.kind === 'channel' && dragged.id === channel.id}
                        acceptsDrops={dragged?.kind !== 'category'}
                        onKeyDown={onKey(
                            { kind: 'channel', id: channel.id },
                            can(channel.permissions, 'MANAGE_CHANNELS')
                        )}
                        onSettings={() =>
                            showDialog({ kind: 'channelSettings', serverId: server.id, channelId: channel.id })
                        }
                    />
                    {line(categoryId, channel.id)}
                </Fragment>
            ))}
        </>
    )

    const othersBefore = (category: ServerCategory) => {
        const others = categories.filter((c) => c.id !== dragged?.id)
        const index = others.findIndex((c) => c.id === category.id)
        return index > 0 ? (others[index - 1]?.id ?? null) : null
    }
    const categoryLine = (category: ServerCategory) =>
        target?.kind === 'category' && category.id !== dragged?.id && othersBefore(category) === target.afterId ? (
            <DropLine />
        ) : null
    const lastLine =
        target?.kind === 'category' &&
        target.afterId !== null &&
        target.afterId === categories.filter((c) => c.id !== dragged?.id).at(-1)?.id ? (
            <DropLine />
        ) : null

    const groups = channelGroups(server)
    const loose = groups.find((group) => group.category === null)?.channels ?? []
    const preview =
        dragged && !byKeyboard
            ? previewOf(server, dragged, (name, count) => t('shell.channelsExtra.categoryCount', { name, count }))
            : null

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => {
                const id = String(active.id)
                const item: Dragged = id.startsWith('cat:')
                    ? { kind: 'category', id: id.slice(4) }
                    : { kind: 'channel', id: id.slice(3) }
                setDragged(item)
                setAnnouncement(t('shell.drag.lifted', { name: nameOf(item) }))
            }}
            onDragMove={onMove}
            onDragEnd={() => dragged && drop(dragged, target)}
            onDragCancel={() => {
                if (dragged) setAnnouncement(t('shell.drag.cancelled', { name: nameOf(dragged) }))
                end()
            }}
            accessibility={{ announcements: QUIET, screenReaderInstructions: { draggable: '' } }}
        >
            <ul className='flex flex-col gap-3'>
                <li>
                    <ul className='flex flex-col gap-0.5'>
                        {managesServer ? <TopZone enabled={dragged?.kind === 'channel'} /> : null}
                        {channelRows(null, loose)}
                    </ul>
                </li>
                {categories.map((category) => {
                    const channels = groupChannels(server, category.id)
                    const isFolded = folded.has(category.id)
                    // Folded, it still shows the open channel.
                    const shown = isFolded
                        ? channels.filter((channel) => pathname === channelPath(server.id, channel.id))
                        : channels
                    const listId = `category-${server.id}-${category.id}`
                    const into =
                        target?.kind === 'channel' &&
                        !clash &&
                        target.slot.categoryId === category.id &&
                        draggedChannel !== undefined &&
                        (draggedChannel.categoryId ?? null) !== category.id
                    return (
                        <Fragment key={category.id}>
                            {categoryLine(category)}
                            <li>
                                <CategoryHeading
                                    category={category}
                                    folded={isFolded}
                                    listId={listId}
                                    manages={managesServer}
                                    lifted={dragged?.kind === 'category' && dragged.id === category.id}
                                    target={into}
                                    acceptsDrops={dragged !== null}
                                    onToggle={() => setFolded(category.id, !isFolded)}
                                    onKeyDown={onKey({ kind: 'category', id: category.id }, managesServer)}
                                    onCreate={() =>
                                        showDialog({
                                            kind: 'createChannel',
                                            serverId: server.id,
                                            categoryId: category.id,
                                            // A category of rooms only gets a room by default (Q9).
                                            type:
                                                channels.length > 0 && channels.every((c) => c.type === 'voice')
                                                    ? 'voice'
                                                    : 'text'
                                        })
                                    }
                                    onSettings={() =>
                                        showDialog({
                                            kind: 'categorySettings',
                                            serverId: server.id,
                                            categoryId: category.id
                                        })
                                    }
                                />
                                <ul id={listId} className='mt-0.5 flex flex-col gap-0.5'>
                                    {channelRows(category.id, shown)}
                                </ul>
                            </li>
                        </Fragment>
                    )
                })}
                {lastLine}
            </ul>
            <p aria-live='assertive' className='sr-only'>
                {announcement}
            </p>
            <DragOverlay dropAnimation={null}>
                {preview ? <DragPreview blocked={Boolean(clash)}>{preview}</DragPreview> : null}
            </DragOverlay>
        </DndContext>
    )
}

/** dnd-kit's own announcements are English; this list says its own (aria-live above). */
const QUIET = {
    onDragStart: () => '',
    onDragOver: () => '',
    onDragEnd: () => '',
    onDragCancel: () => ''
}

function previewOf(server: Server, item: Dragged, groupLabel: (name: string, count: number) => string) {
    if (item.kind === 'channel') {
        const channel = server.channels.find((c) => c.id === item.id)
        if (!channel) return null
        const Icon = channelIcon(channel)
        return (
            <>
                <Icon className='text-text-tertiary' aria-hidden='true' />
                <span className='truncate'>{channel.name}</span>
            </>
        )
    }
    const category = server.categories.find((c) => c.id === item.id)
    if (!category) return null
    // The whole group shrinks to its heading (S-SRV-06 `drag-category`).
    return (
        <span className='truncate text-label font-semibold uppercase text-text-secondary'>
            {groupLabel(category.name, server.channels.filter((c) => c.categoryId === category.id).length)}
        </span>
    )
}

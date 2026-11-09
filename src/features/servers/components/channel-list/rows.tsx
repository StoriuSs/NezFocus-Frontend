import type { KeyboardEvent, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
    Ban,
    ChevronDown,
    ChevronRight,
    Hash,
    LampDesk,
    Lock,
    Plus,
    Settings,
    Volume2,
    type LucideIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { categoryDropId, channelDropId } from '../../lib/drop-target'
import { can } from '../../lib/permissions'
import type { Server, ServerCategory, ServerChannel } from '../../types'

const ROW =
    'flex h-8 items-center gap-2 rounded-input px-2 text-body-sm transition-colors duration-micro [&_svg]:size-4 [&_svg]:shrink-0'

export const channelIcon = (channel: Pick<ServerChannel, 'type' | 'isStudyRoom'>): LucideIcon =>
    channel.type === 'text' ? Hash : channel.isStudyRoom ? LampDesk : Volume2

/** A 12 lock after the name (C-06): a private channel, or a room one may not join. */
const SmallLock = ({ label }: { label: string }) => (
    <Lock role='img' aria-label={label} style={{ width: 12, height: 12 }} className='text-text-tertiary' />
)

/** A small button that shows on the row's hover or focus (C-06 `hover`: ⚙, and ＋ on a heading). */
function HoverButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
    return (
        <WithTooltip label={label}>
            <button
                type='button'
                aria-label={label}
                onClick={onClick}
                className='inline-flex size-6 items-center justify-center rounded-input text-text-tertiary opacity-0 transition-opacity duration-micro hover:bg-surface-3 hover:text-text-primary focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [&_svg]:size-3.5'
            >
                <Icon aria-hidden='true' />
            </button>
        </WithTooltip>
    )
}

/**
 * Where a drop would land (C-06 `dragging`): a 2 `primary` line with a 6 dot
 * at its left end; when the drop is refused (a name clash, D-84), a dashed
 * `text-tertiary` line with a `ban`.
 */
export function DropLine({ blocked }: { blocked?: boolean }) {
    return (
        <li aria-hidden='true' className='relative mx-1 flex h-0 items-center'>
            {blocked ? (
                <>
                    <Ban className='absolute -left-1 size-3 text-text-tertiary' />
                    <span className='ml-3 w-full border-t-2 border-dashed border-text-tertiary' />
                </>
            ) : (
                <>
                    <span className='absolute -left-1 size-1.5 rounded-full bg-primary' />
                    <span className='w-full border-t-2 border-primary' />
                </>
            )}
        </li>
    )
}

/**
 * One channel or room (ChannelRow, C-06). For whoever manages channels in it,
 * the whole row is the handle to drag it (S-SRV-06: press and move 4 px; a
 * plain click still opens it), Space lifts it from the keyboard, and ⚙ on
 * hover opens its settings (S-SET-05).
 */
export function ChannelRow({
    server,
    channel,
    lifted,
    acceptsDrops,
    onKeyDown,
    onSettings
}: {
    server: Server
    channel: ServerChannel
    /** Being moved: its place stays, at 40%. */
    lifted: boolean
    /** False while a category is dragged: only headings take it. */
    acceptsDrops: boolean
    onKeyDown: (event: KeyboardEvent) => void
    onSettings: () => void
}) {
    const { t } = useTranslation()
    const manages = can(channel.permissions, 'MANAGE_CHANNELS')
    const id = channelDropId(channel.id)
    const { setNodeRef: dragRef, listeners } = useDraggable({ id, disabled: !manages })
    const { setNodeRef: dropRef } = useDroppable({ id, disabled: !acceptsDrops })
    const locked = channel.type === 'voice' && !can(channel.permissions, 'CONNECT')
    const Icon = channelIcon(channel)

    const row = (
        <NavLink
            ref={dragRef}
            to={`/channels/${server.id}/${channel.id}`}
            draggable={false}
            {...listeners}
            onKeyDown={onKeyDown}
            className={({ isActive }) =>
                cn(
                    ROW,
                    manages && 'pr-8',
                    lifted && 'opacity-40',
                    isActive
                        ? 'bg-surface-3 font-semibold text-text-primary'
                        : cn(
                              'hover:bg-surface-2',
                              locked ? 'font-medium text-text-tertiary' : 'font-medium text-text-secondary'
                          )
                )
            }
        >
            {({ isActive }) => (
                <>
                    <Icon className={isActive ? 'text-text-primary' : 'text-text-tertiary'} aria-hidden='true' />
                    <span className='min-w-0 flex-1 truncate'>{channel.name}</span>
                    {locked ? (
                        <SmallLock label={t('shell.channels.noConnect')} />
                    ) : channel.isPrivate ? (
                        <SmallLock label={t('shell.channels.private')} />
                    ) : null}
                </>
            )}
        </NavLink>
    )

    return (
        <li ref={dropRef} className='group relative'>
            {locked ? (
                <WithTooltip label={t('shell.channels.noConnect')} side='right'>
                    {row}
                </WithTooltip>
            ) : (
                row
            )}
            {manages ? (
                <span className='absolute right-1 top-1'>
                    <HoverButton
                        label={t(
                            channel.type === 'voice'
                                ? 'shell.channelsExtra.roomSettings'
                                : 'shell.channelsExtra.settings'
                        )}
                        icon={Settings}
                        onClick={onSettings}
                    />
                </span>
            ) : null}
        </li>
    )
}

/**
 * A category's heading (CategoryRow, C-06): in capitals as the list shows
 * them (stored as typed; a screen reader reads the name as typed). It folds
 * and unfolds the channels under it; for those who manage channels it is
 * also the handle to drag the category, and shows ＋ (a channel in it) and ⚙
 * on hover.
 */
export function CategoryHeading({
    category,
    folded,
    listId,
    manages,
    lifted,
    target,
    acceptsDrops,
    onToggle,
    onKeyDown,
    onCreate,
    onSettings
}: {
    category: ServerCategory
    folded: boolean
    listId: string
    manages: boolean
    lifted: boolean
    /** A channel would drop into it from another group: `surface-2`. */
    target: boolean
    acceptsDrops: boolean
    onToggle: () => void
    onKeyDown: (event: KeyboardEvent) => void
    onCreate: () => void
    onSettings: () => void
}) {
    const { t } = useTranslation()
    const id = categoryDropId(category.id)
    const { setNodeRef: dragRef, listeners } = useDraggable({ id, disabled: !manages })
    const { setNodeRef: dropRef } = useDroppable({ id, disabled: !acceptsDrops })
    const Chevron = folded ? ChevronRight : ChevronDown

    return (
        <div
            ref={dropRef}
            className={cn('group relative rounded-input', target && 'bg-surface-2', lifted && 'opacity-40')}
        >
            <button
                ref={dragRef}
                type='button'
                aria-expanded={!folded}
                aria-controls={listId}
                {...listeners}
                onClick={onToggle}
                onKeyDown={onKeyDown}
                // Space is the keyboard's lift for whoever may drag; Enter still folds.
                onKeyUp={(event) => manages && event.key === ' ' && event.preventDefault()}
                className={cn(
                    'flex h-7 w-full items-center gap-1 rounded-input px-1 text-label font-semibold uppercase text-text-tertiary hover:text-text-secondary',
                    manages && 'pr-14'
                )}
            >
                <Chevron className='size-3' aria-hidden='true' />
                <span className='min-w-0 truncate'>{category.name}</span>
            </button>
            {manages ? (
                <span className='absolute right-1 top-0.5 flex'>
                    <HoverButton
                        label={t('shell.channelsExtra.createIn', { name: category.name })}
                        icon={Plus}
                        onClick={onCreate}
                    />
                    <HoverButton
                        label={t('shell.channelsExtra.categorySettings', { name: category.name })}
                        icon={Settings}
                        onClick={onSettings}
                    />
                </span>
            ) : null}
        </div>
    )
}

/** What follows the pointer while dragging (C-06 `dragging`): `surface-2` and the floating shadow. */
export function DragPreview({ children, blocked }: { children: ReactNode; blocked?: boolean }) {
    return (
        <div
            className={cn(
                ROW,
                'translate-x-1 translate-y-1 bg-surface-2 font-medium text-text-primary shadow-float',
                blocked ? 'cursor-not-allowed' : 'cursor-grabbing'
            )}
        >
            {children}
        </div>
    )
}

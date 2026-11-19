import { useRef, type CSSProperties, type RefObject } from 'react'
import { LogOut, Mic, MicOff, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { useModerateParticipant } from '../api/useModerateParticipant'
import type { RoomMenu } from '../hooks/useRoomMenu'
import type { RoomAction } from '../types'

const ITEMS = {
    mute: { icon: MicOff, label: 'shell.voice.mute' },
    unmute: { icon: Mic, label: 'shell.voice.unmute' },
    disconnect: { icon: LogOut, label: 'shell.voice.disconnect' }
} as const

/**
 * A moderator's ⋯ on someone in a room and the menu it opens (D-207, D-208,
 * 07 ROOM-EDGE `mod-menu-tile` / `mod-menu-row`): "Mute" or "Unmute",
 * "Disconnect from room", as `actions` says; no question asked (unmuting
 * and joining again are a click away). The menu hangs under ⋯ (right edges
 * in line), or at the pointer after a right click; closed, the keyboard goes
 * back to `returnTo`.
 *
 * Drawn by the room's page and by the channel list (the shell), whose
 * stylesheet never holds voice's own classes: so no class of its own here,
 * the ⋯'s look and place come from the caller (`className`), the rest is
 * inline.
 */
export function ModeratorMenu({
    menu,
    channelId,
    userId,
    name,
    actions,
    className,
    size,
    foot,
    tabbable,
    returnTo
}: {
    menu: RoomMenu
    channelId: string
    userId: string
    /** The person's name, for ⋯'s label ("Manage Tuấn"). */
    name: string
    actions: RoomAction[]
    className: string
    /** ⋯'s side in px, when the caller's classes cannot say it. */
    size?: number
    /** The foot of ⋯ inside the list item, where the menu hangs from by default. */
    foot: CSSProperties
    /** A Tab stop of its own (the channel list's rows); in the grid the tile takes the keyboard (Shift+F10). */
    tabbable?: boolean
    /** Where the keyboard goes when the menu closes: the tile; by default ⋯ itself. */
    returnTo?: RefObject<HTMLElement | null>
}) {
    const { t } = useTranslation()
    const moderate = useModerateParticipant(channelId)
    const more = useRef<HTMLButtonElement>(null)
    if (actions.length === 0) return null
    return (
        <DropdownMenu open={menu.open} onOpenChange={menu.setOpen}>
            <IconButton
                ref={more}
                label={t('shell.voice.manage', { name })}
                tabIndex={tabbable ? 0 : -1}
                aria-haspopup='menu'
                aria-expanded={menu.open}
                // As a task's ⋯: while the menu is open the page takes no pointer, so this press only closes it.
                onClick={() => menu.show(null)}
                className={className}
                style={{ ...(size ? { width: size, height: size } : {}), ...(menu.open ? { opacity: 1 } : {}) }}
            >
                <MoreHorizontal aria-hidden='true' />
            </IconButton>
            {/* What the menu hangs from: the pointer, or the foot of ⋯. */}
            <DropdownMenuTrigger
                tabIndex={-1}
                aria-hidden='true'
                style={{
                    position: 'absolute',
                    pointerEvents: 'none',
                    width: 0,
                    height: 0,
                    ...(menu.at ? { left: menu.at.x, top: menu.at.y } : foot)
                }}
            />
            <DropdownMenuContent
                align={menu.at ? 'start' : 'end'}
                style={{ width: 220 }}
                onCloseAutoFocus={(event) => {
                    event.preventDefault()
                    const back = returnTo ?? more
                    back.current?.focus()
                }}
            >
                {actions.map((action) => {
                    const { icon: Icon, label } = ITEMS[action]
                    return (
                        <DropdownMenuItem key={action} onSelect={() => moderate.mutate({ action, userId })}>
                            <Icon aria-hidden='true' />
                            {t(label)}
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

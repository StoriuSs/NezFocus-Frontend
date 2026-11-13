import { useRef, type CSSProperties } from 'react'
import { Copy, Link, Pencil, Reply, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { allowedActions } from '../lib/message-permissions'
import type { Message, MessageHandlers } from '../types'

/** Where the menu hangs: at the pointer for a right-click, else under the toolbar's ⋯. */
export type MenuAnchor = { x: number; y: number } | null

/**
 * The message menu (S-CHAT-03): Edit (own, `↑`), Reply — Copy text, Copy
 * message link — Delete (`danger`). Opened from ⋯, a right-click (at the
 * pointer) or Shift+F10 on the message, the same menu each way, hung from a
 * trigger never clicked itself (like the rail's, C-05). Closing it puts focus
 * back where it was opened from. A row that moves focus on (the composer for
 * Reply, the editor for Edit, the dialog for Delete) runs once the menu has
 * closed: while open, the menu keeps focus inside it.
 * Reactions, pins and reports join it in L5 and M7.
 */
export function MessageMenu({
    message,
    handlers,
    open,
    anchor,
    onOpenChange,
    returnFocus
}: {
    message: Message
    handlers: MessageHandlers
    open: boolean
    anchor: MenuAnchor
    onOpenChange: (open: boolean) => void
    returnFocus: () => void
}) {
    const { t } = useTranslation('messaging')
    const can = allowedActions(handlers.me, handlers.permissions, message)
    const afterClose = useRef<(() => void) | null>(null)
    /** Run once the menu has closed (an item's onSelect only). */
    const later = (action: (message: Message) => void) => {
        afterClose.current = () => action(message)
    }
    // A position, not a style: inline.
    const at: CSSProperties = anchor ? { left: anchor.x, top: anchor.y } : { right: 16, top: 14 }

    return (
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
            <DropdownMenuTrigger
                tabIndex={-1}
                aria-hidden='true'
                className='pointer-events-none absolute size-0'
                style={at}
            />
            <DropdownMenuContent
                align={anchor ? 'start' : 'end'}
                className='w-56'
                onCloseAutoFocus={(event) => {
                    event.preventDefault()
                    const then = afterClose.current
                    afterClose.current = null
                    if (then) then()
                    else returnFocus()
                }}
            >
                {can.edit ? (
                    <DropdownMenuItem onSelect={() => later(handlers.edit)}>
                        <Pencil aria-hidden='true' />
                        {t('actions.edit')}
                        <DropdownMenuShortcut>↑</DropdownMenuShortcut>
                    </DropdownMenuItem>
                ) : null}
                {can.reply ? (
                    <DropdownMenuItem onSelect={() => later(handlers.reply)}>
                        <Reply aria-hidden='true' />
                        {t('actions.reply')}
                    </DropdownMenuItem>
                ) : null}
                {can.edit || can.reply ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem onSelect={() => handlers.copyText(message)}>
                    <Copy aria-hidden='true' />
                    {t('actions.copyText')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handlers.copyLink(message)}>
                    <Link aria-hidden='true' />
                    {t('actions.copyLink')}
                </DropdownMenuItem>
                {can.delete ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className='text-danger' onSelect={() => later(handlers.askDelete)}>
                            <Trash2 aria-hidden='true' />
                            {t('actions.delete')}
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

import type { ReactNode, RefObject } from 'react'

/**
 * Who the profile popover (02 S-CHAT-05) is about, and where it opened: a
 * server's page (a message there, its members, a room…) or none (the
 * Friends page, a DM, the inbox: D-252 4e).
 */
export interface ProfileTarget {
    userId: string
    /** The server of the place it opened from; null outside a server. */
    serverId: string | null
    /** What the opener shows already, drawn while the profile is read. */
    name: string
    avatarUrl: string | null
}

/** What the popover's body is given besides whom it shows. */
export interface ProfileCardProps extends ProfileTarget {
    /** Closes the popover (after "Message", a server's link). */
    close: () => void
    /**
     * Closes the popover and shows `dialog` in its place (Block's question, a
     * moderation dialog), until the dialog hands back null as it closes; the
     * keyboard then goes back to what opened the popover.
     */
    handOff: (dialog: ReactNode | null) => void
}

/** The popover itself, around the body: anchored to the opener, open or not. */
export interface ProfilePopoverProps extends ProfileCardProps {
    /** The avatar or name that opened it: where it hangs, and where a click does not close it. */
    anchor: RefObject<HTMLElement | null>
    side: 'right' | 'left' | 'bottom'
    open: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * The profile popover is the servers feature's (it holds a server's roles,
 * its moderation dialogs, and imports the social feature for the profile and
 * where one stands): every feature below it (messages, rooms, tasks, the
 * inbox) opens it through this port, which users declares as the feature
 * they all import (D-253, as `BlockList`). The AppShell connects how it is
 * drawn: a component loaded the first time one opens, declared once outside
 * any render. The Popover's own code (Radix, its positioning) comes with it,
 * never in the first download, where this index is.
 */
export type ProfilePopover = (props: ProfilePopoverProps) => ReactNode

let popover: ProfilePopover | undefined

export function connectProfilePopover(next: ProfilePopover): void {
    popover = next
}

/**
 * The connected popover; undefined before the AppShell connects it (a
 * feature's own tests): the opener is then drawn as it was, with nothing to open.
 */
export function connectedProfilePopover(): ProfilePopover | undefined {
    return popover
}

/**
 * The dialog a popover handed off (`handOff`), drawn by `ProfileDialogs`
 * in the AppShell, so it outlives its opener; one at a time.
 */
let handed: ReactNode = null
const watchers = new Set<() => void>()

export function handOffDialog(next: ReactNode): void {
    handed = next
    watchers.forEach((watcher) => watcher())
}

export const handedDialog = (): ReactNode => handed

export function watchHandedDialog(watcher: () => void): () => void {
    watchers.add(watcher)
    return () => watchers.delete(watcher)
}

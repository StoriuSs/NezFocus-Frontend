import type { BareMessage, PinnedMessage } from '../types'
import { olderThan } from './message-cache'

/*
 * Changes to a channel's pins in the cache (S-CHAT-02), as pure functions,
 * for the events that change a card without reading the list again. A new
 * pin reads it again: its card needs the message as the reader sees it.
 * Each gives the same list back when it holds no such message.
 */

/** `pins.updated` (unpinned) or `message.deleted`: its card leaves the list. */
export function dropPin(pins: PinnedMessage[], id: string): PinnedMessage[] {
    return pins.some((pin) => pin.id === id) ? pins.filter((pin) => pin.id !== id) : pins
}

/**
 * `message.updated`: its card shows the text as it now is; when it was
 * pinned and its reactions stay. An edit older than the card's is late.
 */
export function editPin(pins: PinnedMessage[], message: BareMessage): PinnedMessage[] {
    const held = pins.find((pin) => pin.id === message.id)
    if (!held || olderThan(message, held)) return pins
    return pins.map((pin) =>
        pin.id === message.id
            ? { ...message, pinned: pin.pinned, reactions: pin.reactions, pinnedAt: pin.pinnedAt }
            : pin
    )
}

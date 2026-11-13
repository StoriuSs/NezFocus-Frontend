import { reportError } from '@/lib/error-tracking'

type Listener = (data: unknown) => void

const listeners = new Map<string, Set<Listener>>()

/**
 * Hear one socket event (SRS 5.2), its data in camelCase; returns the way to
 * stop. `ready` is heard too, each time the socket is live again: whoever
 * keeps data from events reads what it missed then (ARCHITECTURE 3.4).
 *
 * How a feature hears the socket without realtime knowing the feature: the
 * features that keep data subscribe here, realtime only hands on.
 */
export function onRealtimeEvent(event: string, listener: Listener): () => void {
    let set = listeners.get(event)
    if (!set) listeners.set(event, (set = new Set()))
    set.add(listener)
    return () => {
        set.delete(listener)
    }
}

/** Hand an event to its listeners; one that throws does not stop the others. */
export function emitRealtimeEvent(event: string, data: unknown): void {
    for (const listener of [...(listeners.get(event) ?? [])]) {
        try {
            listener(data)
        } catch (error) {
            reportError(error, { socketEvent: event })
        }
    }
}

import { useEffect, useState } from 'react'

/**
 * A session's command, sent at once, or, pressed while syncing again (07
 * `syncing`, 08 S-STUDY-02), held in `loading` until the socket is back,
 * then sent. One at a time: pressed again while one is on its way, nothing.
 * The session gone (`active` false), a held one is dropped.
 */
export function useCommandWhenLive<C>(
    mutate: (command: C) => void,
    { pending, syncing, active }: { pending: boolean; syncing: boolean; active: boolean }
): { send: (command: C) => void; busy: boolean } {
    const [held, setHeld] = useState<C | null>(null)
    if (held !== null && !active) setHeld(null)
    useEffect(() => {
        if (held === null || syncing) return
        setHeld(null)
        mutate(held)
    }, [held, syncing, mutate])
    const send = (command: C) => {
        if (pending || held !== null) return
        if (syncing) setHeld(command)
        else mutate(command)
    }
    return { send, busy: pending || held !== null }
}

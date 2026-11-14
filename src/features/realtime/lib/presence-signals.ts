/** Unused this long, a tab says so; once every tab has, the person shows away (REQ-AUTH-07). */
export const IDLE_AFTER_MS = 10 * 60_000

/** Input that counts as using the tab. */
const INPUT = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

/**
 * The tab's presence signals over its socket (SRS 5.2): `heartbeat` at each
 * ping of the server (`beat()`, ~25 s: a network event, so a background tab
 * whose timers the browser slows still beats within the API's 60 seconds),
 * and `presence.idle` when it has gone unused for 10 minutes and again at
 * the first input after. Each input only notes the time; one timer checks
 * it, so moving the mouse costs nothing.
 *
 * `ready()` on each new connection: it starts in use on the API, so a tab
 * still unused says so again. `stop()` when the socket closes.
 */
export function startPresenceSignals(send: (event: string, data?: object) => void) {
    let lastInput = Date.now()
    let idle = false
    let check: ReturnType<typeof setTimeout> | undefined

    const watch = (wait: number) => {
        clearTimeout(check)
        check = setTimeout(() => {
            const unused = Date.now() - lastInput
            if (unused < IDLE_AFTER_MS) return watch(IDLE_AFTER_MS - unused)
            idle = true
            send('presence.idle', { idle: true })
        }, wait)
    }
    const onInput = () => {
        lastInput = Date.now()
        if (!idle) return
        idle = false
        send('presence.idle', { idle: false })
        watch(IDLE_AFTER_MS)
    }

    for (const event of INPUT) window.addEventListener(event, onInput, { passive: true })
    watch(IDLE_AFTER_MS)

    return {
        beat: () => send('heartbeat'),
        ready: () => {
            if (idle) send('presence.idle', { idle: true })
        },
        stop: () => {
            clearTimeout(check)
            for (const event of INPUT) window.removeEventListener(event, onInput)
        }
    }
}

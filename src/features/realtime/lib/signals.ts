/** The open socket's way to send, while there is one. */
let sender: ((event: string, data?: object) => void) | undefined

/** Set by the connection while its socket is open; undefined once closed. */
export function setSignalSender(send: typeof sender): void {
    sender = send
}

/**
 * Send a light signal to the API over the tab's socket (SRS 5.2): typing,
 * presence. Data in camelCase. Dropped while there is no socket or it is
 * not connected: a signal is only worth something now.
 */
export function sendRealtimeSignal(event: string, data?: object): void {
    sender?.(event, data)
}

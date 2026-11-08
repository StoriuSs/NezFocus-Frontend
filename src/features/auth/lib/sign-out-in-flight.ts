/**
 * The sign-out request still on its way, if any.
 *
 * "Not now" in the restore dialog signs out and leaves the page as it is, so
 * the person can sign in again at once. The answer to that sign-out clears
 * the refresh cookie; arriving after the new sign-in's answer, it would clear
 * the new session's cookie instead. The requests that set the cookie wait for
 * it first (auth.api.ts).
 */
let inFlight: Promise<void> | null = null

/** Remember a sign-out request until it settles, however it ends. */
export function trackSignOut(request: Promise<unknown>): void {
    const settled = request.then(
        () => undefined,
        () => undefined
    )
    inFlight = settled
    void settled.then(() => {
        if (inFlight === settled) inFlight = null
    })
}

/** Resolves once no sign-out request is on its way. Never rejects. */
export function untilSignedOut(): Promise<void> {
    return inFlight ?? Promise.resolve()
}

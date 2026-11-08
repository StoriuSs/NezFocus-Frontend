/**
 * Work that must leave before this tab signs out or closes.
 *
 * Some changes wait a moment before they are sent ("Remove photo" waits out
 * its "Undo"). Signing out forgets the access token at once, so a change
 * still waiting would go without one and be refused; the page reloads before
 * anyone sees the error. The auth store runs these first, while the token is
 * still in hand, and lends it through `tokenNow` (it lives in a feature, which
 * src/lib must not import).
 */
type Flush = () => void

const flushes = new Set<Flush>()
let tokenSource: () => string | undefined = () => undefined

/** The auth store says where the access token in memory is. */
export function setTokenSource(source: () => string | undefined): void {
    tokenSource = source
}

/**
 * The access token in memory, as it is, without asking for a fresh one: for
 * a request sent as the page goes, which cannot wait for a refresh.
 */
export function tokenNow(): string | undefined {
    return tokenSource()
}

/** Run `flush` before the next sign-out. Returns the function that takes it back. */
export function onBeforeSignOut(flush: Flush): () => void {
    flushes.add(flush)
    return () => flushes.delete(flush)
}

/**
 * Send what is waiting, now. Called by the auth store just before it forgets
 * the token. A flush only starts its request (it handles its own failure), so
 * nothing here can stop the sign-out.
 */
export function flushBeforeSignOut(): void {
    for (const flush of [...flushes]) flush()
}

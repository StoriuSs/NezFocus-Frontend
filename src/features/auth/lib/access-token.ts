/**
 * The access token, held in this module's memory and nowhere else.
 *
 * Not in localStorage or sessionStorage: any script on the page can read
 * those, so one XSS bug would hand the token over. In memory it dies with the
 * tab; the httpOnly refresh cookie, which no script can read, brings the
 * session back on the next load (auth.store.ts, initAuth).
 */
let current: { token: string; expiresAt: number } | null = null

/** Store a token the API just issued. `expiresIn` is in seconds, as the API sends it. */
export function setAccessToken(token: string, expiresIn: number): void {
    current = { token, expiresAt: Date.now() + expiresIn * 1000 }
}

export function clearAccessToken(): void {
    current = null
}

/**
 * The token, if it stays valid for at least `marginMs` more. With a margin, a
 * request never leaves with a token that expires on its way.
 */
export function accessTokenValidFor(marginMs: number): string | undefined {
    return current && current.expiresAt - Date.now() > marginMs ? current.token : undefined
}

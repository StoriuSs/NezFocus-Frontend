/**
 * One request about the refresh cookie at a time, across this browser's tabs.
 *
 * The tabs share the cookie. A password reset ends every earlier session,
 * this browser's too, and answers with a new cookie (D-62). Its ending
 * reaches another tab's socket (`session.revoked`) before that answer is
 * stored; refreshing then, the tab sends the old cookie, is refused, and
 * signs every tab out, the one that reset the password among them. Holding
 * the lock, the reset makes that refresh wait for its answer, so it carries
 * the new cookie and the tab carries on (D-74).
 *
 * Web Locks is missing in some embedded browsers; then each request simply
 * goes at once, as before.
 */
const COOKIE_LOCK = 'nezfocus-auth-cookie'

export async function withCookieLock<T>(request: () => Promise<T>): Promise<T> {
    const locks = (navigator as Partial<Navigator>).locks
    if (!locks) return request()
    // Held until the request settles: its answer, cookie included, is in.
    return await locks.request(COOKIE_LOCK, request)
}

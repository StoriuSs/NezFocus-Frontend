/**
 * Where 💬 on the rail goes (09 Q6, D-249 L7-e): the first time in a
 * sign-in, the Friends page; then the last place of the messages area,
 * a DM or the Friends page. Kept in this tab's memory only, under the
 * account it belongs to; a sign-out loads the page again, so it starts afresh.
 */
let place: { userId: string; path: string } | null = null

export function rememberMessagesPlace(userId: string, path: string): void {
    place = { userId, path }
}

/** The last place of the messages area for this account, or null the first time. */
export const messagesPlace = (userId: string | undefined): string | null =>
    place && place.userId === userId ? place.path : null

/** A place no longer there (a DM closed): 💬 goes to the Friends page again. */
export function forgetMessagesPlace(path: string): void {
    if (place?.path === path) place = null
}

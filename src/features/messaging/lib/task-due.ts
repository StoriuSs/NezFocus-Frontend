import type { MessageAuthor } from '../types'

/*
 * The words of a due-date reminder in its channel (05 S-TASK-01 › Tin nhắc
 * hạn, `reminder-long`): with the two limits below the longest reminder is
 * 2 lines, panel open at 1440 as at 768; "Xem việc" shows the whole task.
 */

/** A title longer than this is cut at a word boundary, then "…". */
const TITLE_MAX = 60
/** People named; the rest are "và N người khác". */
const PEOPLE_SHOWN = 3

/** The task's title, cut at the last word boundary within 60 characters when longer. */
export function shortTaskTitle(title: string): string {
    if (title.length <= TITLE_MAX) return title
    const cut = title.slice(0, TITLE_MAX + 1)
    const boundary = cut.search(/\s\S*$/)
    return `${(boundary > 0 ? cut.slice(0, boundary) : title.slice(0, TITLE_MAX)).trimEnd()}…`
}

/**
 * Whom the reminder names, in the order the task gave them, oneself first
 * when on it: up to 3, and how many more.
 */
export function reminderPeople(
    users: readonly MessageAuthor[],
    me: string | undefined
): { shown: MessageAuthor[]; others: number } {
    const mine = users.filter((user) => user.id === me)
    const ordered = [...mine, ...users.filter((user) => user.id !== me)]
    return { shown: ordered.slice(0, PEOPLE_SHOWN), others: Math.max(0, ordered.length - PEOPLE_SHOWN) }
}

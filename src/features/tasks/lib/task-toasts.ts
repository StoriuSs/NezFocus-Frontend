/** A task's title in a Toast: at most 24 characters, then "…" (C-16). */
export function shortTitle(title: string, max = 24): string {
    const letters = [...title]
    return letters.length > max ? `${letters.slice(0, max).join('').trimEnd()}…` : title
}

/** How long the Toast of a status change shows, with "Hoàn tác", the row standing still meanwhile (C-16, 05 Q4). */
export const UNDO_MS = 8000

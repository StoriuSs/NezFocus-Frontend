/**
 * Web Storage that never throws.
 *
 * `localStorage` / `sessionStorage` access throws — not returns null — when
 * site data is blocked (strict privacy settings, some embedded webviews,
 * sandboxed iframes). Nothing stored in this app is worth a crash: reads fall
 * back to null and writes are dropped.
 */
function safeStorage(get: () => Storage) {
    return {
        get(key: string): string | null {
            try {
                return get().getItem(key)
            } catch {
                return null
            }
        },
        set(key: string, value: string): void {
            try {
                get().setItem(key, value)
            } catch {
                // Not persisted.
            }
        },
        remove(key: string): void {
            try {
                get().removeItem(key)
            } catch {
                // Nothing to remove.
            }
        }
    }
}

export const safeLocalStorage = safeStorage(() => window.localStorage)
export const safeSessionStorage = safeStorage(() => window.sessionStorage)

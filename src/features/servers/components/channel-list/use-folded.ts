import { useCallback, useState } from 'react'

const key = (serverId: string) => `nezfocus:folded-categories:${serverId}`

function read(serverId: string): Set<string> {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(key(serverId)) ?? '[]')
        return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [])
    } catch {
        return new Set()
    }
}

/**
 * The folded categories of a server, kept in this browser (C-06: remembered
 * per server). A browser that refuses storage just forgets them on reload.
 */
export function useFoldedCategories(serverId: string) {
    const [state, setState] = useState(() => ({ serverId, folded: read(serverId) }))
    // Another server opened: its own set (state adjusted while rendering, not in an effect).
    const current = state.serverId === serverId ? state : { serverId, folded: read(serverId) }
    if (current !== state) setState(current)

    const setFolded = useCallback(
        (categoryId: string, folded: boolean) =>
            setState((previous) => {
                const next = new Set(previous.folded)
                if (folded) next.add(categoryId)
                else next.delete(categoryId)
                try {
                    localStorage.setItem(key(previous.serverId), JSON.stringify([...next]))
                } catch {
                    // Storage refused (private window, quota): folded until reload.
                }
                return { ...previous, folded: next }
            }),
        []
    )
    return { folded: current.folded, setFolded }
}

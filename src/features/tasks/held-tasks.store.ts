import { create } from 'zustand'
import type { Hold } from './lib/task-board'

/**
 * The rows standing still after their box was clicked, while their Toast
 * shows (05 S-TASK-01 › Tương tác, R5): by task id, one each (the Toast is
 * keyed by the task's id too). A store, not the panel's state: the Toast
 * outlives a panel closed meanwhile, and its end lets the row go wherever
 * the board is drawn next.
 */
interface HeldTasks {
    holds: ReadonlyMap<string, Hold>
    hold: (taskId: string, hold: Hold) => void
    release: (taskId: string) => void
}

export const useHeldTasks = create<HeldTasks>((set) => ({
    holds: new Map(),
    hold: (taskId, hold) =>
        set(({ holds }) => {
            const next = new Map(holds)
            next.set(taskId, hold)
            return { holds: next }
        }),
    release: (taskId) =>
        set(({ holds }) => {
            if (!holds.has(taskId)) return { holds }
            const next = new Map(holds)
            next.delete(taskId)
            return { holds: next }
        })
}))

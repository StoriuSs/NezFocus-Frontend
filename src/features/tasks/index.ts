import { lazy } from 'react'

/**
 * What other features use from tasks: a text channel's Task Board
 * (S-TASK-01), which the servers feature's channel page shows in its right
 * panel. Lazy: the board, its dialogs, words, hooks and stylesheet are a
 * chunk of their own, fetched the first time a board opens
 * (docs/code-splitting.md, D-193).
 *
 * `useOpenTaskCount`: the channel settings' warning before the board is
 * turned off (04 S-SET-05 `taskboard-off`).
 */
export const TaskBoard = lazy(() => import('./components/TaskBoard'))
export { useOpenTaskCount } from './api/useTaskBoard'
export type { TaskBoardPlace, TaskCandidate } from './types'

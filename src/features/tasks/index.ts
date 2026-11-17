import { lazy } from 'react'

/**
 * What other features use from tasks: a text channel's Task Board
 * (S-TASK-01), which the servers feature's channel page shows in its right
 * panel, and a task's detail (S-TASK-02), which the shell opens on any page
 * with `?task=`. Lazy: the board, the detail, their dialogs, words, hooks
 * and stylesheet are chunks of their own, fetched the first time one opens
 * (docs/code-splitting.md, D-193).
 *
 * `useOpenTaskCount`: the channel settings' warning before the board is
 * turned off (04 S-SET-05 `taskboard-off`).
 */
export const TaskBoard = lazy(() => import('./components/TaskBoard'))
export const TaskDetail = lazy(() => import('./components/TaskDetail'))
export type { PlaceOf } from './components/TaskDetail'
export { useOpenTaskCount } from './api/useTaskBoard'
export type { TaskBoardPlace, TaskCandidate } from './types'

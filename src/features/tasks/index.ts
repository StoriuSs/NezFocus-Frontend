import { lazy } from 'react'

/**
 * What other features use from tasks: a text channel's Task Board
 * (S-TASK-01), which the servers feature's channel page shows in its right
 * panel, and a task's detail (S-TASK-02), which the shell opens on any page
 * with `?task=`. Lazy: the board, the detail, their dialogs, words, hooks
 * and stylesheet are chunks of their own, fetched the first time one opens
 * (docs/code-splitting.md, D-193).
 *
 * The To-do page (S-TASK-04) and its column, lazy too, handed the servers
 * and what one may do there by the servers feature (D-197).
 *
 * `useOpenTaskCount`: the channel settings' warning before the board is
 * turned off (04 S-SET-05 `taskboard-off`). `useDueTaskCount`: the rail's
 * "Việc" badge, with the To-do lists read again at midnight (D-196).
 */
export const TaskBoard = lazy(() => import('./components/TaskBoard'))
export const TaskDetail = lazy(() => import('./components/TaskDetail'))
export const MyTasks = lazy(() => import('./components/MyTasks'))
export const MyTasksNav = lazy(() => import('./components/MyTasksNav'))
export type { PlaceOf } from './components/TaskDetail'
export { useOpenTaskCount } from './api/useTaskBoard'
export { useDueTaskCount } from './api/useMyTasks'
export type { TaskBoardPlace, TaskCandidate, TaskServer } from './types'

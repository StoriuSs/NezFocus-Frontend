import { MyTasks } from '@/features/tasks'
import { useTaskPlaceOf } from '../api/useTaskBoardPlace'
import { useTaskServers } from '../hooks/useTaskServers'

/**
 * The To-do page (`/tasks`, S-TASK-04), drawn by the tasks feature with
 * what this one knows (D-197): one's servers in the rail's order, and what
 * one may do in each channel (`placeOf`, as a task's detail has it).
 */
export default function MyTasksRoute() {
    return <MyTasks servers={useTaskServers()} placeOf={useTaskPlaceOf()} />
}

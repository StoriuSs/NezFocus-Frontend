import { Suspense } from 'react'
import { MyTasksNav } from '@/features/tasks'
import { useTaskServers } from '../hooks/useTaskServers'
import { SERVERS_PATHS } from '../lib/paths'

/** The To-do page's column (S-TASK-04): the tasks feature's, with one's servers in the rail's order (D-197). */
export function MyTasksColumn() {
    const servers = useTaskServers()
    return (
        <Suspense fallback={null}>
            <MyTasksNav servers={servers} path={SERVERS_PATHS.tasks} />
        </Suspense>
    )
}

import { Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { TaskDetail } from '@/features/tasks'
import { useTaskPlaceOf } from '../api/useTaskBoardPlace'
import { channelPath } from '../lib/paths'

/**
 * A task's detail on whatever page has `?task=` (05 Q6, S-TASK-02), drawn
 * by the shell: the task's channel as this feature knows it (the servers
 * list: its names, one's rights there, D-188), not there when one left the
 * server or the channel went (the detail says "không còn khả dụng"). The
 * channel line goes to that channel with its Task Board open.
 */
export default function TaskDetailRoute({ taskId, onClose }: { taskId: string; onClose: () => void }) {
    const navigate = useNavigate()
    const placeOf = useTaskPlaceOf()
    return (
        <Suspense fallback={null}>
            <TaskDetail
                taskId={taskId}
                placeOf={placeOf}
                onClose={onClose}
                onOpenChannel={(task) =>
                    void navigate(channelPath(task.serverId, task.channelId), { state: { openTasks: true } })
                }
            />
        </Suspense>
    )
}

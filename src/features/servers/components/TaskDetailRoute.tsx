import { Suspense, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { TaskDetail, type PlaceOf } from '@/features/tasks'
import { taskBoardPlace } from '../api/useTaskBoardPlace'
import { useServers } from '../api/useServers'
import { channelPath } from '../lib/paths'

/** The detail has no board to send to its settings. */
const noSettings = () => undefined

/**
 * A task's detail on whatever page has `?task=` (05 Q6, S-TASK-02), drawn
 * by the shell: the task's channel as this feature knows it (the servers
 * list: its names, one's rights there, D-188), not there when one left the
 * server or the channel went (the detail says "không còn khả dụng"). The
 * channel line goes to that channel with its Task Board open.
 */
export default function TaskDetailRoute({ taskId, onClose }: { taskId: string; onClose: () => void }) {
    const servers = useServers().data
    const navigate = useNavigate()
    const placeOf = useCallback<PlaceOf>(
        (serverId, channelId) => {
            if (!servers) return undefined
            const server = servers.find((candidate) => candidate.id === serverId)
            const channel = server?.channels.find((candidate) => candidate.id === channelId)
            return server && channel ? taskBoardPlace(server, channel, noSettings) : null
        },
        [servers]
    )
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

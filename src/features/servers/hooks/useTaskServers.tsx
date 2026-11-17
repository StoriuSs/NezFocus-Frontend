import { useMemo } from 'react'
import type { TaskServer } from '@/features/tasks'
import { useServers } from '../api/useServers'
import { ServerIcon } from '../components/ServerIcon'

/**
 * One's servers in the rail's order, as the To-do page's column lists them
 * (S-TASK-04, D-197): the name, and the picture 20 high (its initials on
 * `surface-2` without one). Undefined while the list loads.
 */
export function useTaskServers(): TaskServer[] | undefined {
    const servers = useServers().data
    return useMemo(
        () =>
            servers?.map((server) => ({
                id: server.id,
                name: server.name,
                icon: (
                    <ServerIcon
                        name={server.name}
                        iconUrl={server.iconUrl}
                        className='size-5 rounded-server text-micro'
                    />
                )
            })),
        [servers]
    )
}

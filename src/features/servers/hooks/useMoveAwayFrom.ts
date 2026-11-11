import { useLocation, useNavigate } from 'react-router-dom'
import { useServers } from '../api/useServers'
import { serverAfter } from '../lib/membership'
import { channelPath, isServerPath } from '../lib/paths'

/**
 * What to do with the open page once one leaves or deletes this server
 * (03 S-SRV-04 Q7): a page of it moves to the next server on the rail
 * (below, else above), at its first text channel; with none left, to /study
 * and its "no server yet". A page of anything else stays where it is.
 *
 * Returns the navigation's promise: the caller takes the server out of the
 * cache once the page has moved. `flushSync`: the router otherwise hands the
 * move to React as a transition, still pending when the promise settles, and
 * the cache change, drawn first, has the page of the server just gone send
 * everyone to /study (L9b e2e).
 */
export function useMoveAwayFrom(serverId: string) {
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const servers = useServers().data ?? []

    return async () => {
        if (!isServerPath(pathname, serverId)) return
        const next = serverAfter(servers, serverId)
        await navigate(next ? channelPath(next) : '/study', { replace: true, flushSync: true })
    }
}

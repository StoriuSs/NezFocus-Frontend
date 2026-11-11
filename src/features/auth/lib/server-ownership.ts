import axios from 'axios'
import type { QueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'

/** A server the account owns, as deleting the account needs it (REQ-AUTH-09, D-121). */
export interface OwnedServer {
    id: string
    name: string
    memberCount: number
}

export interface OwnedServers {
    /** With other members: handed over (or deleted) first (`delete-blocked-owner`, D-76). */
    blocking: OwnedServer[]
    /** Only they are in it: deleted with the account, its invites stopped now (D-121). */
    alone: OwnedServer[]
}

/**
 * What deleting the account needs to know of the servers one owns, and the
 * dialog that says which to hand over first. Servers are another feature,
 * which already uses auth: auth says what it needs here, the servers feature
 * answers, and the AppShell connects the two, as the backend does with its
 * SERVER_OWNERSHIP port (D-160) and the API client with `connectApiSession`.
 */
export interface ServerOwnership {
    /** Read as the server list has it now; never refuses (the API checks again). */
    owned(queryClient: QueryClient): Promise<OwnedServers>
    /**
     * 10-settings › S-ME-03 `delete-blocked-owner`, its rows leading to the
     * handover; the server list is read again for them.
     */
    showBlocked(servers: OwnedServer[], queryClient: QueryClient): void
}

let ownership: ServerOwnership | undefined

export function connectServerOwnership(next: ServerOwnership): void {
    ownership = next
}

/** The connected answer. Unconnected is a wiring mistake, not "no servers". */
export function serverOwnership(): ServerOwnership {
    if (!ownership) throw new Error('ServerOwnership is not connected: the AppShell connects it.')
    return ownership
}

/**
 * The servers an OWNERSHIP_TRANSFER_REQUIRED refusal lists (`data.servers`):
 * the check before the password missed one (a member joined meanwhile).
 * Null for any other error, and for one naming none it can read: a dialog
 * with nothing to hand over would leave nothing to do.
 */
export function blockingServers(error: unknown): OwnedServer[] | null {
    if (getApiErrorType(error) !== 'OWNERSHIP_TRANSFER_REQUIRED' || !axios.isAxiosError(error)) return null
    const servers = (error.response?.data as { data?: { servers?: unknown } } | undefined)?.data?.servers
    if (!Array.isArray(servers)) return null
    const readable = servers.filter(
        (server): server is OwnedServer =>
            typeof server === 'object' &&
            server !== null &&
            typeof (server as OwnedServer).id === 'string' &&
            typeof (server as OwnedServer).name === 'string' &&
            typeof (server as OwnedServer).memberCount === 'number'
    )
    return readable.length > 0 ? readable : null
}

import axios from 'axios'
import { getApiErrorType, NETWORK_ERROR } from '@/lib/api-error'

/** What went wrong opening or joining by an invite, as the screens tell it apart (S-SRV-01, S-SRV-03). */
export type InviteProblem =
    | { kind: 'invalid' }
    | { kind: 'limited'; waitSeconds: number }
    | { kind: 'banned' }
    | { kind: 'maxServers' }
    | { kind: 'offline' }
    | { kind: 'failed' }

export function inviteProblem(error: unknown): InviteProblem {
    switch (getApiErrorType(error)) {
        case 'INVITE_INVALID':
            return { kind: 'invalid' }
        case 'RATE_LIMIT_EXCEEDED': {
            const header = axios.isAxiosError(error) ? error.response?.headers?.['retry-after'] : undefined
            const seconds = Number(header)
            return { kind: 'limited', waitSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 60 }
        }
        case 'BANNED_FROM_SERVER':
            return { kind: 'banned' }
        case 'MAX_SERVERS_REACHED':
            return { kind: 'maxServers' }
        case NETWORK_ERROR:
            return { kind: 'offline' }
        default:
            return { kind: 'failed' }
    }
}

/** A server name in a toast: at most 24 characters, then "…" (C-16). */
export const toastName = (name: string) =>
    Array.from(name).length > 24 ? `${Array.from(name).slice(0, 24).join('')}…` : name

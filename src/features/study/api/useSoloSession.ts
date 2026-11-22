import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { serverNow } from '@/lib/server-clock'
import { isLater } from '../lib/phases'
import { expiredOf } from '../lib/solo'
import { hearSoloEnded } from '../study.store'
import type { SoloState } from '../types'
import { studyKeys } from './keys'
import { latestSoloOf } from './liveSessions'
import { fetchSolo } from './study.api'

/** The Solo page's address (08 S-STUDY-02). */
export const SOLO_PATH = '/study/solo'

/**
 * GET /me/solo-session, kept by what was told meanwhile: a later state told
 * stays (D-225), and a Solo told running while the read was on its way (a
 * start, its event) is not undone by a read that began before it. Read
 * again with none, a Solo this tab knew waiting whose wait is over ended as
 * expired: its summary for this tab (D-234).
 */
async function readSolo(client: QueryClient): Promise<SoloState> {
    const held = client.getQueryData<SoloState>(studyKeys.solo())?.session
    const asked = Date.now()
    const read = await fetchSolo()
    const told = latestSoloOf(client)
    const last = told?.session
    if (read.session && last && isLater(last, read.session)) {
        return { ...read, session: last.status === 'ended' ? null : last }
    }
    if (!read.session && last && last.status !== 'ended' && told.at >= asked) return { ...read, session: last }
    if (!read.session && held) {
        const expired = expiredOf(held, serverNow())
        if (expired) hearSoloEnded(expired)
    }
    return read
}

/** One's Solo not yet ended, or null, and the cycle the next start uses (REQ-STUDY-05, D-229); the socket keeps it. */
export function useSoloSession() {
    const client = useQueryClient()
    return useQuery({ queryKey: studyKeys.solo(), queryFn: () => readSolo(client) })
}

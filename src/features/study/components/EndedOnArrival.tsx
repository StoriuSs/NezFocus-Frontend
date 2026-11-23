import { useEffect, useState } from 'react'
import { TimerOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/study'
import { serverNow } from '@/lib/server-clock'
import { accountTimeZone, timeIn } from '@/lib/time-zones'
import { useStudyStore } from '../study.store'

/** How long after arriving a session found ended is still the one the row showed (08 `room-ended-on-join`). */
export const ARRIVAL_MS = 10_000

/**
 * A room opened from its row on the Study page while that row still showed
 * a session (08 `room-ended-on-join`): the session it showed ended just
 * before, or just after, so the page is the room with no session, and a
 * Toast `timer-off` says when ("Phiên học vừa kết thúc lúc 21:46"), above the
 * buttons. Only that session (`sessionId`), and only around the arrival:
 * one ending later while one looks at the page is the ring's to show, and
 * one long ended is not "just" (the server's clock, as the session's).
 * Renders nothing; lazy, so the study words load with it.
 */
export default function EndedOnArrival({ channelId, sessionId }: { channelId: string; sessionId: string }) {
    const { t } = useTranslation('study')
    const ended = useStudyStore((state) => state.ended[channelId])
    const [arrivedAt] = useState(() => serverNow())
    const endedAt = ended?.id === sessionId ? ended.endedAt : null

    useEffect(() => {
        if (!endedAt) return
        const at = Date.parse(endedAt)
        if (Math.abs(at - arrivedAt) > ARRIVAL_MS) return
        toast(t('overview.rooms.endedOnArrival', { time: timeIn(accountTimeZone(), new Date(at)) }), {
            id: `room-ended-${sessionId}`,
            icon: <TimerOff className='size-4' aria-hidden='true' />
        })
    }, [t, endedAt, arrivedAt, sessionId])
    return null
}

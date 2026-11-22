import { createElement, useEffect, useRef } from 'react'
import { Timer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/study'
import { serverNow } from '@/lib/server-clock'
import { accountTimeZone, timeIn } from '@/lib/time-zones'
import type { AnySession } from '../types'

/** A fresh join, by the server's clock (D-18): the toast only this soon after it. */
const JUST_JOINED_MS = 30_000

/**
 * Joining a room whose focus runs: "Bạn đang được tính giờ từ 21:47" with
 * the icon `timer` (07 `just-joined`), once a join; not on coming back to
 * the room's page later.
 */
export function useJustJoined(session: AnySession | null, joinedAt: string | null): void {
    const { t } = useTranslation('study')
    const told = useRef<string | null>(null)
    const counting = session?.status === 'running' && session.phase === 'focus'
    useEffect(() => {
        if (!counting || !joinedAt || told.current === joinedAt) return
        told.current = joinedAt
        if (serverNow() - Date.parse(joinedAt) > JUST_JOINED_MS) return
        toast(t('news.counting', { time: timeIn(accountTimeZone(), new Date(joinedAt)) }), {
            icon: createElement(Timer, { className: 'size-4', 'aria-hidden': true })
        })
    }, [counting, joinedAt, t])
}

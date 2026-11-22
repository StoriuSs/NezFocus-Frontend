import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/study'
import { cycleName } from '../lib/cycle-words'
import { sessionCycle } from '../lib/phases'
import { useStudyStore } from '../study.store'
import { startToastId } from '../lib/toast-ids'

/**
 * What the room hears of its session while one is on its page (07 › Ma
 * trận vai trò): someone else's start, skip or new cycle as a toast naming
 * them ("An đã bỏ qua pha", "An đã đổi chu kỳ thành 50/10"); oneself made
 * Host as a toast ("Bình đã rời phòng · bạn đang điều khiển phiên học").
 * Pausing and resuming change the ring's line only; one's own doings, a
 * phase ending and the end say nothing here.
 */
export function useSessionNews(
    channelId: string,
    me: string,
    nameOf: (userId: string) => string,
    /** The Host when the page opened: whose place one takes, should one become it. */
    hostId: string | null
): void {
    const { t } = useTranslation('study')
    const news = useStudyStore((state) => state.news[channelId])
    const seen = useRef(news)
    const lastHost = useRef(hostId)
    const names = useRef(nameOf)
    useEffect(() => {
        names.current = nameOf
    })

    useEffect(() => {
        if (!news || news === seen.current) return
        seen.current = news
        const name = (userId: string | null) => (userId ? names.current(userId) : t('news.someone'))
        const byOther = news.actorId !== me
        if (news.action === 'start' && byOther) {
            toast(t('news.started', { name: name(news.actorId) }), { id: startToastId(channelId) })
        }
        if (news.action === 'skip' && byOther) toast(t('news.skipped', { name: name(news.actorId) }))
        if (news.action === 'config' && byOther) {
            toast(t('news.changed', { name: name(news.actorId), cycle: cycleName(t, sessionCycle(news)) }))
        }
        if (news.action === 'host' && news.hostId === me && lastHost.current !== me) {
            const left = lastHost.current
            toast(left ? t('news.youHostAfter', { name: name(left) }) : t('news.youHost'))
        }
        lastHost.current = news.hostId
    }, [news, me, channelId, t])
}

import { createElement, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PhoneMissed } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/social'
import { useTitleRing } from '@/hooks/useDocumentTitle'
import { playCallEnd, startCallLoop } from '@/lib/call-sounds'
import { serverNow } from '@/lib/server-clock'
import { useMyCall } from '../../api/useMyCall'
import { useBlockedIds } from '../../api/useRelationships'
import { useCallStore } from '../../call.store'
import { callToRejoin, rejoinCallDone } from '../../lib/call-keep'
import { callClock } from '../../lib/call-result'
import { rejoinCall } from '../../lib/call-session'
import { nameOf } from '../../lib/friends-list'
import { dmPath, isDmPage } from '../../lib/paths'
import type { Call } from '../../types'
import { resultWords } from './result-words'

const IncomingCalls = lazy(() => import('./IncomingCalls'))

/** The lock one tab takes to ring (D-255): the card shows in every tab, the sound plays in one. */
const RING_LOCK = 'call-ring'

/**
 * How long after it began a call may ring here: the backend's 45 seconds
 * (REQ-SOCIAL-05) and a few for its word to come. Past it the card goes
 * even with no word (the socket lost while ringing: 09 › offline, no ring).
 */
const RING_WINDOW_MS = 45_000 + 5_000

/** The calls ringing to me still within their window, the list drawn again as the next one runs out. */
function useStillRinging(incoming: readonly Call[]): Call[] {
    const [now, setNow] = useState(serverNow)
    const ends = incoming.map((call) => Date.parse(call.createdAt) + RING_WINDOW_MS)
    const next = Math.min(...ends.filter((end) => end > now))
    useEffect(() => {
        if (!Number.isFinite(next)) return
        const timer = setTimeout(() => setNow(serverNow()), Math.max(next - serverNow(), 0) + 50)
        return () => clearTimeout(timer)
    }, [next])
    return incoming.filter((_, index) => ends[index]! > now)
}

/**
 * Rings in one tab of the browser: the first to take the lock rings; a tab
 * waiting for it rings once the one ringing closes. Returns the way to stop
 * (and let go, or stop waiting), and whether this tab rang.
 */
function ringInOneTab(): { stop: () => void; rang: () => boolean } {
    let rang = false
    let stopLoop = () => undefined as void
    if (typeof navigator === 'undefined' || !navigator.locks) {
        stopLoop = startCallLoop('ring')
        return { stop: () => stopLoop(), rang: () => true }
    }
    let letGo = () => undefined as void
    const held = new Promise<void>((resolve) => (letGo = resolve))
    const waiting = new AbortController()
    let stopped = false
    void navigator.locks
        .request(RING_LOCK, { signal: waiting.signal }, async () => {
            if (stopped) return
            rang = true
            stopLoop = startCallLoop('ring')
            await held
        })
        .catch(() => undefined)
    return {
        stop: () => {
            stopped = true
            waiting.abort()
            stopLoop()
            letGo()
        },
        rang: () => rang
    }
}

/**
 * The calls on every page (09 S-CALL-01 / 02), mounted once by the AppShell:
 * - `GET /me/call` read as the app opens and kept live; a reload of the tab
 *   that held a call goes back into it (D-255);
 * - a call ringing to me: its card (C-49, lazy), read out at once by a live
 *   region kept here (one mounted with its words is not read), the ring in
 *   one tab, kept while any card rings, the tab's title "(3) Tuấn đang gọi ·
 *   NezFocus" (Q12, D-255); none past its 45 seconds;
 * - ringing out from this tab: the ringback; a result: the sound of the end
 *   (none for one's own Cancel, D-255), and a Toast saying it when one is on
 *   another page ("Cuộc gọi với Chi đã kết thúc · 08:41", 09 DM-EDGE);
 * - a call ringing to me missed: "Cuộc gọi nhỡ từ {Tuấn}" · "Mở tin nhắn"
 *   (none from someone I blocked); answered in another tab: "Đã nghe máy ở
 *   tab khác";
 * - leaving the page in a call asks first (beforeunload, 09 DM-EDGE).
 */
export function CallWatch() {
    const { t } = useTranslation('social')
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const my = useMyCall().data
    const tab = useCallStore((state) => state.current)
    const result = useCallStore((state) => state.result)
    const notice = useCallStore((state) => state.notice)
    const blocked = useBlockedIds()
    const live = useStillRinging(my?.incoming ?? [])
    const ringing = tab ? [] : live
    const anyRinging = ringing.length > 0
    const rang = useRef<() => boolean>(() => false)

    // A reload of the tab that held a call: back into it, once my calls are read.
    useEffect(() => {
        if (!my) return
        const kept = callToRejoin()
        if (!kept) return
        rejoinCallDone()
        rejoinCall(kept, my)
    }, [my])

    // One ring while any card rings: a second card, or one of two missed, does not start it again.
    useEffect(() => {
        if (!anyRinging) return
        const ring = ringInOneTab()
        rang.current = ring.rang
        return ring.stop
    }, [anyRinging])

    const oldest = ringing[0]
    useTitleRing(oldest ? t('call.ringingTitle', { name: nameOf(oldest.user) ?? '' }) : null)

    const ringingOut = tab?.phase === 'calling'
    useEffect(() => (ringingOut ? startCallLoop('ringback') : undefined), [ringingOut])

    const page = useRef(pathname)
    useEffect(() => {
        page.current = pathname
    }, [pathname])
    useEffect(() => {
        if (!result) return
        playCallEnd()
        if (isDmPage(page.current, result.call.dmId)) return
        const name = nameOf(result.call.user) ?? ''
        const said =
            result.kind === 'ended' && result.seconds !== null
                ? t('call.toasts.overAway', { name, clock: callClock(result.seconds * 1000) })
                : resultWords(t, result, name)
        toast(said, { id: `call-result-${result.call.id}` })
    }, [result, t])

    useEffect(() => {
        if (!notice) return
        useCallStore.setState({ notice: null })
        const { call } = notice
        if (notice.kind === 'answered-elsewhere') {
            toast(t('call.toasts.answeredElsewhere'), { id: `call-answered-${call.id}` })
            return
        }
        // The end of the ring this tab played; another card still ringing keeps it going.
        if (rang.current() && !anyRinging) playCallEnd()
        if (blocked?.has(call.user.id)) return
        toast(t('call.toasts.missed', { name: nameOf(call.user) ?? '' }), {
            id: `call-missed-${call.id}`,
            icon: createElement(PhoneMissed, { className: 'size-4 text-danger' }),
            action: { label: t('call.toasts.openDm'), onClick: () => void navigate(dmPath(call.dmId)) }
        })
    }, [notice, t, navigate, blocked, anyRinging])

    const holding = tab !== null
    useEffect(() => {
        if (!holding) return
        const ask = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', ask)
        return () => window.removeEventListener('beforeunload', ask)
    }, [holding])

    const first = ringing[0]
    return (
        <>
            <p className='sr-only' aria-live='assertive'>
                {first
                    ? t(first.video ? 'call.incoming.announceVideo' : 'call.incoming.announce', {
                          name: nameOf(first.user) ?? ''
                      })
                    : ''}
            </p>
            {anyRinging ? (
                <Suspense fallback={null}>
                    <IncomingCalls calls={ringing} />
                </Suspense>
            ) : null}
        </>
    )
}

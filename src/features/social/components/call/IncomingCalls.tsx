import { Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Phone, PhoneOff, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import '../../social.css'
import { RoomControl } from '@/features/voice'
import { notifyMutationError } from '@/lib/query-client'
import { useCallPress } from '../../hooks/useCallPress'
import { declineIncoming } from '../../lib/call-session'
import { nameOf } from '../../lib/friends-list'
import type { Call } from '../../types'
import { PersonAvatar } from '../PersonAvatar'
import { CallHalo } from './CallHalo'
import { DANGER, PRESSED, SUCCESS } from './call-tones'

// One-offs of C-49, inline: the social stylesheet keeps no class for them.
/** Over every layer, a dialog's scrim too (Radix's layers are `z-50`). */
const LAYER = { zIndex: 60 }
const CARD = { width: 360, gap: 10, pointerEvents: 'auto' as const }
/** The avatar 64 in its halo 12. */
const HALO = { width: 88, height: 88 }
const AVATAR = { width: 64, height: 64 }
/** The buttons 40 apart, 6 under the words. */
const BUTTONS = { gap: 40, paddingTop: 6 }

/**
 * The incoming calls (C-49 IncomingCall, 09 S-CALL-02): a card per call
 * ringing to me, two at most, the second 8 under the first; top centre of
 * the window, 16 from the top, over every layer, a dialog's scrim too
 * (clickable through it), no scrim of its own, never taking the focus (Enter
 * while typing must not answer); first in the page's Tab order while it
 * rings (its own node at the top of the body). Esc does not decline.
 */
export default function IncomingCalls({ calls }: { calls: readonly Call[] }) {
    const host = useTopNode()
    if (!host) return null
    return createPortal(
        <div className='pointer-events-none fixed inset-x-0 top-4 flex flex-col items-center gap-2' style={LAYER}>
            {calls.map((call) => (
                <IncomingCard key={call.id} call={call} />
            ))}
        </div>,
        host
    )
}

/** A node first in the body, for the cards to come first in the Tab order (C-49). */
function useTopNode(): HTMLElement | null {
    const [node, setNode] = useState<HTMLElement | null>(null)
    useEffect(() => {
        const made = document.createElement('div')
        document.body.prepend(made)
        setNode(made)
        return () => made.remove()
    }, [])
    return node
}

/**
 * One card (C-49): avatar 64 in the ringing halo, the name (`headline` 600,
 * two lines at most), "Cuộc gọi thoại đến" / "Cuộc gọi video đến", then Từ
 * chối (`danger`) · Nghe (`success`), and for a video call Nghe có video. A
 * `region` "Cuộc gọi đến"; `CallWatch` reads it out at once ("Tuấn đang gọi,
 * cuộc gọi thoại").
 */
function IncomingCard({ call }: { call: Call }) {
    const { t } = useTranslation('social')
    const { answer } = useCallPress()
    const [busy, setBusy] = useState(false)
    const name = nameOf(call.user) ?? ''
    const press = (run: () => Promise<void>) => () => {
        if (busy) return
        setBusy(true)
        void run().finally(() => setBusy(false))
    }
    return (
        <section
            aria-label={t('call.incoming.region')}
            style={CARD}
            className='flex flex-col items-center rounded-button border bg-surface-1 p-6 shadow-float'
        >
            <span className='relative flex items-center justify-center' style={HALO}>
                <CallHalo width={12} />
                <PersonAvatar person={call.user} className='shrink-0' style={AVATAR} initialClassName='text-title-2' />
            </span>
            <p className='line-clamp-2 w-full break-words text-center text-headline font-semibold text-text-primary'>
                {name}
            </p>
            <p className='text-body-sm text-text-secondary'>
                {t(call.video ? 'call.incoming.video' : 'call.incoming.voice')}
            </p>
            <div className='flex items-start justify-center' style={BUTTONS}>
                <Suspense fallback={null}>
                    <RoomControl
                        icon={<PhoneOff />}
                        label={t('call.incoming.decline')}
                        hint={t('call.incoming.decline')}
                        className={PRESSED}
                        style={DANGER}
                        onClick={press(() => declineIncoming(call).catch(notifyMutationError))}
                    />
                    <RoomControl
                        icon={<Phone />}
                        label={t('call.incoming.accept')}
                        hint={t('call.incoming.accept')}
                        className={PRESSED}
                        style={SUCCESS}
                        onClick={press(() => answer(call, false))}
                    />
                    {call.video ? (
                        <RoomControl
                            icon={<Video />}
                            label={t('call.incoming.acceptVideo')}
                            hint={t('call.incoming.acceptVideo')}
                            className={PRESSED}
                            style={SUCCESS}
                            onClick={press(() => answer(call, true))}
                        />
                    ) : null}
                </Suspense>
            </div>
        </section>
    )
}

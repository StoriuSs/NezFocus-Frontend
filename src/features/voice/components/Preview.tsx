import { useEffect, useRef, useState } from 'react'
import { CloudOff, Loader2, Lock, MicOff, MonitorSmartphone, Timer, WifiOff, type LucideIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { Banner } from '@/components/Banner'
import { Button } from '@/components/ui/button'
import { settingsCache, useProfile } from '@/features/users'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { useToastEdge } from '@/hooks/useToastArea'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { endsAtText } from '@/lib/time-zones'
import { useOrderedPeople } from '../hooks/useOrderedPeople'
import { forgetProblem, joinRoom } from '../lib/session'
import type { VoiceRoom } from '../types'
import { useVoiceStore } from '../voice.store'
import { MicControl } from './MicControl'
import { PersonAvatar } from './PersonAvatar'
import { Seat } from './Seat'

/**
 * The room's preview page (S-ROOM-01 `voice-preview`, 07 P3): the only way in
 * (D-44). Who is there as a row of seats (C-20 `seat`, C-18 order without
 * oneself), how many; one's own tile, always there so the buttons never jump
 * (D-53; the camera comes with L3b); Mic (icon only) and "Join room".
 *
 * - `joining`: the button busy; Mic still works. Over 10 seconds, or no
 *   token: `join-error`, a neutral line under the buttons.
 * - `switch-room`: in another room in this tab, the button says "Switch to
 *   this room" (joining leaves the other).
 * - `forbidden`: timed out (D-54) or no CONNECT: the button disabled with
 *   why, no Mic and no own tile.
 * - `offline`: the button disabled, "You need a connection to join".
 * - `other-tab` (ROOM-EDGE): the account is in this room elsewhere: a Banner,
 *   and the button "Join here instead" (the other place is put out, VC-02).
 * - `mic-blocked` (S-MOD-04): a Banner, the Mic `blocked`; joining still hears.
 */
export function Preview({ room }: { room: VoiceRoom }) {
    const { t, i18n } = useTranslation('voice')
    const me = useProfile().data
    const timeZone = useQuery(settingsCache).data?.timezone
    const now = useMinuteClock()
    const online = useBrowserOnline()
    const call = useVoiceStore((state) => state.call)
    const mic = useVoiceStore((state) => state.mic)
    const problem = useVoiceStore((state) => (state.problem?.channelId === room.channelId ? state.problem : null))
    const [helpOpen, setHelpOpen] = useState(false)
    // Toasts sit 16 above the buttons (07 › Quy ước, C-16).
    const buttons = useRef<HTMLDivElement>(null)
    useToastEdge('barTop', buttons)
    const others = room.people.filter((person) => person.user.id !== me?.id)
    const seats = useOrderedPeople(others, undefined)
    const here = call?.channelId === room.channelId
    // In it, but not from this tab (this tab joining it is not elsewhere).
    const elsewhere = !here && room.people.some((person) => person.user.id === me?.id)
    const joining = here && call.phase === 'joining'
    const inOther = call !== null && call.channelId !== room.channelId

    // A refusal is forgotten when the page goes, or what the room allows changes (read again after it).
    const { channelId, canConnect, timeoutUntil } = room
    useEffect(() => () => forgetProblem(channelId), [channelId, canConnect, timeoutUntil])
    // Until when: the server's, or the API's answer when the server is not read again yet.
    const until = room.timeoutUntil ?? problem?.until ?? null
    const timedOut = until !== null && new Date(until) > now
    const forbidden = timedOut || !room.canConnect || problem?.kind === 'refused'
    const reason: { icon: LucideIcon; text: string } | null = forbidden
        ? timedOut && until
            ? {
                  icon: Timer,
                  text: t('preview.timedOut', {
                      time: endsAtText(new Date(until), now, i18n.language, timeZone)
                  })
              }
            : { icon: Lock, text: t('preview.noConnect') }
        : !online
          ? { icon: WifiOff, text: t('preview.offline') }
          : problem?.kind === 'network' && !joining
            ? { icon: CloudOff, text: t('preview.joinError') }
            : null

    const join = () => void joinRoom({ serverId: room.serverId, channelId: room.channelId, name: room.name })

    return (
        <div className='flex min-h-full flex-col'>
            {elsewhere && !forbidden ? (
                <Banner variant='strip' icon={MonitorSmartphone}>
                    {t('preview.otherTab')}
                </Banner>
            ) : null}
            {mic === 'blocked' && !forbidden ? (
                <Banner variant='strip' icon={MicOff}>
                    {t('micBlocked.banner')}{' '}
                    <button
                        type='button'
                        onClick={() => setHelpOpen(true)}
                        className='font-semibold text-text-primary underline-offset-4 hover:underline'
                    >
                        {t('micBlocked.howTo')}
                    </button>
                </Banner>
            ) : null}
            <div className='flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8'>
                <div className='flex flex-col items-center gap-3'>
                    {seats.length > 0 ? (
                        <ul aria-label={t('room.people')} className='flex flex-wrap justify-center gap-4'>
                            {seats.map((person) => (
                                <Seat key={person.user.id} person={person} />
                            ))}
                        </ul>
                    ) : null}
                    <p className='text-body font-semibold text-text-primary'>
                        {room.people.length === 0
                            ? t('preview.empty')
                            : t('preview.count', { count: room.people.length })}
                    </p>
                </div>
                {forbidden || !me ? null : (
                    <div className='relative flex h-36 w-48 flex-col overflow-hidden rounded-button bg-surface-2'>
                        <span className='flex min-h-0 flex-1 items-center justify-center'>
                            <PersonAvatar
                                person={{ ...me, username: me.username ?? null, displayName: me.displayName ?? null }}
                                className='size-14 text-headline'
                            />
                        </span>
                        <span className='flex h-7 shrink-0 items-center bg-scrim px-2 text-label font-semibold text-text-primary'>
                            {t('preview.you')}
                        </span>
                    </div>
                )}
                <div className='flex flex-col items-center gap-3'>
                    <div ref={buttons} className='flex items-center gap-4'>
                        {forbidden ? null : (
                            <MicControl
                                canSpeak={room.canSpeak}
                                iconOnly
                                helpOpen={helpOpen}
                                onHelpOpenChange={setHelpOpen}
                            />
                        )}
                        <Button
                            className='w-60'
                            disabled={forbidden || !online}
                            aria-busy={joining || undefined}
                            onClick={joining ? undefined : join}
                        >
                            {joining ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {t(elsewhere ? 'preview.joinHere' : inOther ? 'preview.switch' : 'preview.join')}
                        </Button>
                    </div>
                    {reason ? (
                        <p role='status' className='flex items-center gap-2 text-label text-text-secondary'>
                            <reason.icon className='size-4 shrink-0' aria-hidden='true' />
                            {reason.text}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

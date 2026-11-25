import { useEffect, useRef } from 'react'
import { Send, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { Button } from '@/components/ui/button'
import type { FriendStripKind } from '../lib/dm-profile'
import type { PersonMoves } from '../hooks/usePersonMoves'
import { Gated } from './Gated'

/**
 * The strip under a DM's Header while we are not friends (S-DM-03
 * `not-friend`, `not-friend-sent`, C-16 `not-friend`): 44 high on
 * `surface-2`, an icon and one line (`body-sm` `text-secondary`), the
 * buttons at its end. Nothing between us: "You and {name} aren't friends"
 * · Add friend (`secondary · S`) · Block (`text · S`, its dialog); my
 * request: `send` "Friend request sent to {name}" · Cancel request; theirs:
 * "{name} wants to be friends" · Accept (`primary · S`) · Decline
 * (`secondary · S`). Off with "You need a connection" while offline.
 */
export function FriendStrip({
    kind,
    name,
    offline,
    moves
}: {
    kind: FriendStripKind
    name: string
    offline: boolean
    moves: PersonMoves
}) {
    const { t } = useTranslation('social')
    const off = offline || moves.busy
    const busy = moves.busy || undefined
    const Icon = kind === 'outgoing' ? Send : UserRound
    const buttons = useRef<HTMLDivElement>(null)
    // The button pressed is gone as the strip changes: the focus, left on nothing, goes to its first one.
    const was = useRef(kind)
    useEffect(() => {
        if (was.current === kind) return
        was.current = kind
        const focused = document.activeElement
        if (!focused || focused === document.body) buttons.current?.querySelector('button')?.focus()
    }, [kind])
    return (
        <div className='flex h-11 shrink-0 items-center gap-2 bg-surface-2 px-4 text-body-sm text-text-secondary'>
            <Icon className='size-4 shrink-0' aria-hidden='true' />
            <p className='min-w-0 flex-1 truncate'>{t(`strip.${kind}`, { name })}</p>
            <div ref={buttons} className='flex shrink-0 items-center gap-2'>
                {kind === 'none' ? (
                    <>
                        <Gated offline={offline}>
                            <Button size='sm' variant='outline' disabled={off} aria-busy={busy} onClick={moves.request}>
                                {t('profile.request')}
                            </Button>
                        </Gated>
                        <Gated offline={offline}>
                            <Button size='sm' variant='text' disabled={off} aria-busy={busy} onClick={moves.block}>
                                {t('friends.block')}
                            </Button>
                        </Gated>
                    </>
                ) : kind === 'outgoing' ? (
                    <Gated offline={offline}>
                        <Button size='sm' variant='text' disabled={off} aria-busy={busy} onClick={moves.cancel}>
                            {t('friends.cancel')}
                        </Button>
                    </Gated>
                ) : (
                    <>
                        <Gated offline={offline}>
                            <Button size='sm' disabled={off} aria-busy={busy} onClick={moves.accept}>
                                {t('friends.accept')}
                            </Button>
                        </Gated>
                        <Gated offline={offline}>
                            <Button size='sm' variant='outline' disabled={off} aria-busy={busy} onClick={moves.decline}>
                                {t('friends.decline')}
                            </Button>
                        </Gated>
                    </>
                )}
            </div>
        </div>
    )
}

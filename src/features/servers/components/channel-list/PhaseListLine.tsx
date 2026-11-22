import { Trans, useTranslation } from 'react-i18next'
import { PhaseTag } from '@/components/shell/PhaseTag'
import { minutesLeft, remainingMs, useListClock, type AnySession } from '@/features/study'

/**
 * A room's session under its row in the channel list (C-06 `focus-running`,
 * C-19 `list`): "Tập trung · còn 18 phút", again as each minute goes; "còn
 * dưới 1 phút" in the last; paused, "Tạm dừng" with no number. The number
 * in the numeric face, 500 (the .pen's PhaseBadge/S). On the server's
 * clock, as the room's page.
 */
export function PhaseListLine({ session }: { session: AnySession }) {
    const { t } = useTranslation()
    const now = useListClock(session)
    const paused = session.status === 'paused'
    const minutes = minutesLeft(remainingMs(session, now))
    return (
        // Nothing at its right end (unlike a person's row): the words may run to the edge.
        <p className='flex h-7 items-center pl-[30px] pr-1 text-label'>
            <PhaseTag phase={session.phase} paused={paused}>
                {paused ? null : (
                    <span className='shrink-0 whitespace-pre'>
                        {' · '}
                        {minutes > 0 ? (
                            <Trans
                                t={t}
                                i18nKey='shell.study.left'
                                count={minutes}
                                values={{ count: minutes }}
                                components={[<span key='minutes' className='font-numeric font-medium tabular-nums' />]}
                            />
                        ) : (
                            t('shell.study.underAMinute')
                        )}
                    </span>
                )}
            </PhaseTag>
        </p>
    )
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Coffee, LampDesk, Pause, Volume2 } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipWhenCut } from '@/components/ui/tooltip'
import { useListClock } from '@/features/study'
import { PHASE_ICONS, PHASE_TEXT } from '@/lib/phase-colors'
import { cn } from '@/lib/utils'
import {
    activityParts,
    activitySentence,
    activityView,
    clockOf,
    type Activity,
    type ActivityIcon,
    type ActivityParts,
    type ActivityWords
} from '../lib/activity-line'
import { useConnectedRoomLookup } from '../lib/room-lookup'
// The member panel (servers) shows the line too: its classes are this feature's stylesheet's.
import '../social.css'

/**
 * The line's words, the shell's (`common`): the DM column and the member
 * panel show it. The minutes are the list line's ("còn 18 phút", C-19), as
 * plain text for the Tooltip and screen readers.
 */
function useActivityWords(): { words: ActivityWords; left: (minutes: number) => string } {
    const { t } = useTranslation()
    return useMemo(
        () => ({
            words: {
                phase: (phase) => t(`shell.study.phase.${phase}`),
                paused: t('shell.study.phase.paused'),
                waiting: t('shell.study.phase.waiting'),
                waitingShort: t('shell.activity.waitingShort'),
                solo: t('shell.activity.solo'),
                soloFull: t('shell.activity.soloFull'),
                inRoom: (room) => t('shell.activity.inRoom', { room }),
                unseenStudy: t('shell.activity.unseenStudy'),
                unseenVoice: t('shell.activity.unseenVoice')
            },
            left: (minutes) =>
                minutes > 0
                    ? t('shell.study.left', { count: minutes }).replace(/<\/?0>/g, '')
                    : t('shell.study.underAMinute')
        }),
        [t]
    )
}

/** Where someone is and what they study, as one sees it, live: what the line and the block both read. */
function useActivity(userId: string, activity: Activity, form: 'short' | 'full' | 'block') {
    const seen = useConnectedRoomLookup().roomOf(userId)
    const view = activityView(activity, seen, true)
    const now = useListClock(clockOf(view))
    const { words, left } = useActivityWords()
    if (!view) return null
    const parts = activityParts(view, form, now, words)
    // The whole sentence: the full form's, the room's name and the phase a short form leaves out.
    const whole = activitySentence(form === 'short' ? activityParts(view, 'full', now, words) : parts, left)
    return { parts, whole, says: activitySentence(parts, left) }
}

function LineIcon({ icon, className }: { icon: ActivityIcon; className: string }) {
    const Icon =
        icon.kind === 'phase'
            ? PHASE_ICONS[icon.phase]
            : icon.kind === 'pause'
              ? Pause
              : icon.kind === 'waiting'
                ? Coffee
                : icon.study
                  ? LampDesk
                  : Volume2
    // A Solo whose break is over: `coffee` in the short break's colour, as the C-30 sheet draws it.
    const colour =
        icon.kind === 'phase'
            ? PHASE_TEXT[icon.phase]
            : icon.kind === 'waiting'
              ? 'text-phase-short'
              : 'text-text-secondary'
    return <Icon aria-hidden='true' className={cn('shrink-0', colour, className)} />
}

interface LineProps {
    userId: string
    activity: Activity | null
    form: 'short' | 'full'
    /** False where the place says the line must not show (`activityShown`: offline, blocked, cannot message). */
    shown?: boolean
    /** What shows when no line does (a DMRow's last message, a FriendRow's presence). */
    fallback?: ReactNode
    /** " · " before it, after a username (the DM header, C-07 `dm`). */
    separated?: boolean
    className?: string
}

/**
 * Someone's activity line (C-30, D-108, D-252): icon 12 (14 in the full
 * form) in the phase's colour, then the words in `label` `text-secondary`.
 * `short` in a DMRow or a MemberRow, `full` in a FriendRow or the DM header.
 * "còn N phút" is never cut: the room's name after it gives way first, then
 * the words before it. Again each minute while a phase runs. The whole
 * sentence shows in a Tooltip when the line says less (the short form, or
 * words cut), on hover or while the row has the focus, and is what screen
 * readers read. Nothing (or `fallback`) when there is nothing to show; no
 * hook runs then, so a long member list of people not studying stays light.
 */
export function ActivityLine({ activity, shown = true, fallback = null, ...props }: LineProps) {
    if (!shown || !activity) return fallback
    return <ShownLine activity={activity} fallback={fallback} {...props} />
}

function ShownLine({
    userId,
    activity,
    form,
    fallback,
    separated = false,
    className
}: Omit<LineProps, 'activity' | 'shown'> & { activity: Activity }) {
    const line = useRef<HTMLSpanElement>(null)
    const [open, setOpen] = useState(false)
    const shown = useActivity(userId, activity, form)
    const says = shown?.says
    const whole = shown?.whole

    // The row's focus (its link, or a button in it) shows the Tooltip too (C-30 "hover / focus hàng").
    useEffect(() => {
        const row = line.current?.closest('a, li')
        if (!row || says === undefined || says === whole) return
        const show = () => setOpen(true)
        const hide = () => setOpen(false)
        row.addEventListener('focusin', show)
        row.addEventListener('focusout', hide)
        return () => {
            row.removeEventListener('focusin', show)
            row.removeEventListener('focusout', hide)
        }
    }, [says, whole])

    if (!shown) return fallback
    const { parts } = shown
    const cut = () =>
        [...(line.current?.querySelectorAll<HTMLElement>('[data-cut]') ?? [])].some(
            (part) => part.scrollWidth > part.clientWidth
        )
    return (
        <Tooltip open={open} onOpenChange={(next) => setOpen(next && (shown.whole !== shown.says || cut()))}>
            <TooltipTrigger asChild>
                <span ref={line} className={cn('flex items-center gap-1 text-label text-text-secondary', className)}>
                    <span className='sr-only'>{shown.whole}</span>
                    {separated ? (
                        <span aria-hidden='true' className='shrink-0 pr-0.5 text-text-tertiary'>
                            ·
                        </span>
                    ) : null}
                    <LineIcon icon={parts.icon} className={form === 'short' ? 'size-3' : 'size-3.5'} />
                    <Words parts={parts} />
                </span>
            </TooltipTrigger>
            <TooltipContent>{shown.whole}</TooltipContent>
        </Tooltip>
    )
}

/** The words as drawn (screen readers read the whole sentence instead): one run, no gap, the spaces the words' own. */
function Words({ parts }: { parts: ActivityParts }) {
    const { t } = useTranslation()
    return (
        <span aria-hidden='true' className='flex'>
            <span data-cut className='min-w-0 truncate'>
                {parts.lead}
            </span>
            {parts.left === null ? null : (
                <span className='shrink-0 whitespace-pre'>
                    {' · '}
                    {parts.left > 0 ? (
                        // The list line's words (C-19), the number in figures of one width: the line does not jump each minute.
                        <Trans
                            t={t}
                            i18nKey='shell.study.left'
                            count={parts.left}
                            values={{ count: parts.left }}
                            components={[<span key='minutes' className='tabular-nums' />]}
                        />
                    ) : (
                        t('shell.study.underAMinute')
                    )}
                </span>
            )}
            {parts.tail ? (
                // Gives way 999 times faster than the words before the minutes.
                <span data-cut style={{ flexShrink: 999 }} className='min-w-0 truncate whitespace-pre'>
                    {` · ${parts.tail}`}
                </span>
            ) : null}
        </span>
    )
}

/**
 * The activity block of a profile (S-CHAT-05 › Khối hoạt động, C-50): on
 * `surface-2`, the phase and the minutes left on its first line, the room's
 * name (or "Đang học một mình") under it in `body-sm` 600, cut with its
 * Tooltip; one line for a room with no session or one I do not see. Nothing
 * when there is nothing to show.
 */
export function ActivityBlock({
    userId,
    activity,
    shown = true
}: {
    userId: string
    activity: Activity | null
    shown?: boolean
}) {
    if (!shown || !activity) return null
    return <ShownBlock userId={userId} activity={activity} />
}

function ShownBlock({ userId, activity }: { userId: string; activity: Activity }) {
    const shown = useActivity(userId, activity, 'block')
    if (!shown) return null
    const { parts } = shown
    return (
        <div className='flex min-w-0 flex-col gap-0.5 rounded-input bg-surface-2 px-3 py-2'>
            <p className='sr-only'>{shown.whole}</p>
            <p aria-hidden='true' className='flex items-center gap-1.5 text-label text-text-secondary'>
                <LineIcon icon={parts.icon} className='size-3.5' />
                <Words parts={parts} />
            </p>
            {parts.below ? (
                <TooltipWhenCut label={parts.below}>
                    <p aria-hidden='true' className='truncate text-body-sm font-semibold text-text-primary'>
                        {parts.below}
                    </p>
                </TooltipWhenCut>
            ) : null}
        </div>
    )
}

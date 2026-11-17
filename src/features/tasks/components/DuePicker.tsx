import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/tasks'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { instantAt, wallClock } from '@/lib/time-zones'
import { cn } from '@/lib/utils'
import {
    addDays,
    addMonths,
    compareDays,
    monthWeeks,
    nextFriday,
    readTime,
    sameDay,
    stepTime,
    timeText,
    weekdayOf,
    type Day
} from '../lib/calendar'

const DEFAULT_TIME = { hour: 23, minute: 59 }
/** The grid's columns, Monday first (C-43). */
const COLUMNS = [1, 2, 3, 4, 5, 6, 0] as const

const dayOf = (at: Date, timeZone: string | undefined): Day => {
    const { year, month, day } = wallClock(at, timeZone)
    return { year, month, day }
}
const dayKey = ({ year, month, day }: Day) => `${year}-${month}-${day}`

/**
 * DatePicker (C-43): the due field and its Popover, in the account's zone
 * (AUTH-08). Quick buttons "Hôm nay" · "Ngày mai" · "Thứ 6 tới", a month
 * (Monday first; days gone by dimmed and not picked; today ringed), the time
 * (23:59 unless changed; `HH:mm` or `HHmm`, ↑ ↓ by 15 minutes), "Bỏ hạn" and
 * "Xong". Picking a day keeps it open; "Xong", Enter or a click outside
 * apply; Esc closes keeping what was there. A time past today is the
 * form's to refuse, on saving.
 */
export function DuePicker({
    id,
    buttonRef,
    value,
    onChange,
    text,
    now,
    timeZone,
    invalid,
    describedBy,
    disabled
}: {
    id?: string
    /** The field's button: the form focuses it when the date is refused. */
    buttonRef?: Ref<HTMLButtonElement>
    value: Date | null
    onChange: (next: Date | null) => void
    /** How the value reads on the field ("Thứ 6, 23/10 · 23:59"). */
    text: string | null
    now: Date
    timeZone: string | undefined
    invalid?: boolean
    describedBy?: string
    disabled?: boolean
}) {
    const { t, i18n } = useTranslation('tasks')
    const [open, setOpen] = useState(false)
    const today = dayOf(now, timeZone)
    const [day, setDay] = useState<Day | null>(null)
    const [time, setTime] = useState(timeText(DEFAULT_TIME))
    const [month, setMonth] = useState<Day>(today)
    const [focused, setFocused] = useState<Day>(today)
    const discard = useRef(false)
    const grid = useRef<HTMLTableElement>(null)
    const parsed = readTime(time)

    const start = (next: boolean) => {
        if (next) {
            const held = value ? dayOf(value, timeZone) : null
            const clock = value ? wallClock(value, timeZone) : DEFAULT_TIME
            setDay(held)
            setTime(timeText(clock))
            setMonth(held ?? today)
            setFocused(held ?? today)
            discard.current = false
        } else if (!discard.current && parsed && day) {
            onChange(instantAt({ ...day, ...parsed }, timeZone))
        }
        setOpen(next)
    }

    const pick = (next: Day) => {
        if (compareDays(next, today) < 0) return
        setDay(next)
        setFocused(next)
        setMonth(next)
    }
    // A key moved the focus: on that day as soon as it is drawn (the next key goes there).
    const moving = useRef(false)
    const moveTo = (next: Day) => {
        moving.current = true
        setFocused(next)
        if (next.month !== month.month || next.year !== month.year) setMonth(next)
    }
    useEffect(() => {
        if (!moving.current) return
        moving.current = false
        grid.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(focused)}"]`)?.focus()
    }, [focused])
    const gridKey = (event: KeyboardEvent<HTMLButtonElement>, at: Day) => {
        const moves: Record<string, () => Day> = {
            ArrowLeft: () => addDays(at, -1),
            ArrowRight: () => addDays(at, 1),
            ArrowUp: () => addDays(at, -7),
            ArrowDown: () => addDays(at, 7),
            PageUp: () => addMonths(at, -1),
            PageDown: () => addMonths(at, 1),
            Home: () => addDays(at, -((weekdayOf(at) + 6) % 7)),
            End: () => addDays(at, 6 - ((weekdayOf(at) + 6) % 7))
        }
        const move = moves[event.key]
        if (!move) return
        event.preventDefault()
        moveTo(move())
    }
    const timeKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            setTime(timeText(stepTime(parsed ?? DEFAULT_TIME, event.key === 'ArrowUp' ? 1 : -1)))
        } else if (event.key === 'Enter') {
            event.preventDefault()
            if (parsed) start(false)
        }
    }
    const monthTitle = t('picker.monthTitle', {
        month: month.month,
        year: month.year,
        monthName: new Intl.DateTimeFormat(i18n.language, { month: 'long', timeZone: 'UTC' }).format(
            new Date(Date.UTC(month.year, month.month - 1, 1))
        )
    })

    return (
        <Popover open={open} onOpenChange={start}>
            <PopoverTrigger asChild>
                <button
                    ref={buttonRef}
                    id={id}
                    type='button'
                    disabled={disabled}
                    data-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    className={cn(
                        'flex h-10 w-full items-center gap-2 rounded-input border border-border-input bg-surface-1 px-3 text-left text-body-sm transition-colors duration-micro hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        'data-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-2',
                        open && 'border-primary'
                    )}
                >
                    <Calendar className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                    <span className={cn('flex-1 truncate', text ? 'text-text-primary' : 'text-text-tertiary')}>
                        {text ?? t('form.noDue')}
                    </span>
                    <ChevronDown className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className='w-[296px] p-3'
                // Opened: focus on the day picked, or today (C-43 › Bàn phím).
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${dayKey(focused)}"]`)?.focus()
                }}
                onEscapeKeyDown={() => {
                    discard.current = true
                }}
            >
                <div className='flex gap-2'>
                    <Button type='button' variant='outline' size='sm' className='px-2.5' onClick={() => pick(today)}>
                        {t('picker.today')}
                    </Button>
                    <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='px-2.5'
                        onClick={() => pick(addDays(today, 1))}
                    >
                        {t('picker.tomorrow')}
                    </Button>
                    <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='px-2.5'
                        onClick={() => pick(nextFriday(today))}
                    >
                        {t('picker.nextFriday')}
                    </Button>
                </div>
                <div className='mt-3 flex items-center justify-between'>
                    <IconButton label={t('picker.previousMonth')} onClick={() => setMonth(addMonths(month, -1))}>
                        <ChevronLeft />
                    </IconButton>
                    <span className='text-body-sm font-semibold text-text-primary' aria-live='polite'>
                        {monthTitle}
                    </span>
                    <IconButton label={t('picker.nextMonth')} onClick={() => setMonth(addMonths(month, 1))}>
                        <ChevronRight />
                    </IconButton>
                </div>
                <table ref={grid} role='grid' aria-label={monthTitle} className='mt-2 w-full border-collapse'>
                    <thead>
                        <tr>
                            {COLUMNS.map((weekday) => (
                                <th
                                    key={weekday}
                                    scope='col'
                                    className='h-7 text-center text-label font-normal text-text-tertiary'
                                >
                                    {t(`picker.weekday.${weekday}`)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {monthWeeks(month.year, month.month).map((week) => (
                            <tr key={dayKey(week[0]!)}>
                                {week.map((cell) => {
                                    const past = compareDays(cell, today) < 0
                                    const chosen = day !== null && sameDay(cell, day)
                                    const outside = cell.month !== month.month
                                    return (
                                        <td key={dayKey(cell)} aria-selected={chosen} className='p-0 text-center'>
                                            <button
                                                type='button'
                                                data-day={dayKey(cell)}
                                                tabIndex={sameDay(cell, focused) ? 0 : -1}
                                                aria-disabled={past || undefined}
                                                aria-current={sameDay(cell, today) ? 'date' : undefined}
                                                aria-label={new Intl.DateTimeFormat(i18n.language, {
                                                    dateStyle: 'full',
                                                    timeZone: 'UTC'
                                                }).format(new Date(Date.UTC(cell.year, cell.month - 1, cell.day)))}
                                                onClick={() => pick(cell)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault()
                                                        pick(cell)
                                                    } else gridKey(event, cell)
                                                }}
                                                className={cn(
                                                    'size-9 rounded-input text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                                    past || outside ? 'text-text-tertiary' : 'text-text-primary',
                                                    past ? 'cursor-default' : 'hover:bg-surface-2',
                                                    sameDay(cell, today) && !chosen && 'border border-border-input',
                                                    chosen &&
                                                        'bg-primary font-semibold text-on-primary hover:bg-primary'
                                                )}
                                            >
                                                {cell.day}
                                            </button>
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className='mt-3 grid gap-1'>
                    <div className='flex items-center gap-3'>
                        <label htmlFor={`${id ?? 'due'}-time`} className='text-label text-text-secondary'>
                            {t('picker.time')}
                        </label>
                        <Input
                            id={`${id ?? 'due'}-time`}
                            value={time}
                            onChange={(event) => setTime(event.target.value)}
                            onBlur={() => parsed && setTime(timeText(parsed))}
                            onKeyDown={timeKey}
                            inputMode='numeric'
                            aria-invalid={!parsed}
                            aria-describedby={parsed ? undefined : `${id ?? 'due'}-time-error`}
                            className='h-9 w-[88px]'
                        />
                    </div>
                    {parsed ? null : (
                        <p id={`${id ?? 'due'}-time-error`} className='text-label text-danger'>
                            {t('picker.timeError')}
                        </p>
                    )}
                </div>
                <div className='mt-3 flex items-center justify-between'>
                    <Button
                        type='button'
                        variant='text'
                        size='sm'
                        onClick={() => {
                            discard.current = true
                            onChange(null)
                            setOpen(false)
                        }}
                    >
                        {t('picker.clear')}
                    </Button>
                    <Button type='button' size='sm' disabled={!parsed} onClick={() => start(false)}>
                        {t('picker.apply')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}

import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Segment<T extends string> {
    value: T
    label: string
    /** The language of the label, when it differs from the page's: "English" on a Vietnamese page. */
    lang?: string
    /** A label of numbers ("25/5"): in Unbounded, as C-26a draws numbers. */
    numeric?: boolean
    /** An icon before the label (`view`: `circle-dot` "Vòng", `layout-grid` "Lưới", C-26a). */
    icon?: ReactNode
    /** After the label (`view`: the cameras on, "📹1"). */
    suffix?: ReactNode
}

interface SegmentedControlProps<T extends string> {
    value: T
    onValueChange: (value: T) => void
    segments: readonly Segment<T>[]
    'aria-labelledby'?: string
    disabled?: boolean
    /** `view`: 32 high for a Header, icon 14 and `label` 500 (C-26a, D-55). */
    variant?: 'default' | 'view'
}

/**
 * A segmented control (C-26a): a few choices side by side, one of them on.
 * 36 high on `surface-2`; the chosen one is lifted to `surface-1` with a
 * `border` edge and `text-primary` 600. A radio group for assistive tech:
 * Tab reaches the chosen one, ← → move and choose at once (10-settings ›
 * S-ME-04 › Tương tác). `view` is the Header's (a study room's Ring / Grid).
 */
export function SegmentedControl<T extends string>({
    value,
    onValueChange,
    segments,
    disabled,
    variant = 'default',
    'aria-labelledby': labelledBy
}: SegmentedControlProps<T>) {
    const buttons = useRef<(HTMLButtonElement | null)[]>([])

    function choose(index: number) {
        const next = (index + segments.length) % segments.length
        const segment = segments[next]
        if (!segment) return
        buttons.current[next]?.focus()
        if (segment.value !== value) onValueChange(segment.value)
    }

    function keyDown(event: KeyboardEvent, index: number) {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
        if (step === undefined) return
        event.preventDefault()
        choose(index + step)
    }

    return (
        <div
            role='radiogroup'
            aria-labelledby={labelledBy}
            className={cn('inline-flex gap-0.5 rounded-input bg-surface-2 p-0.5', variant === 'view' ? 'h-8' : 'h-9')}
        >
            {segments.map((segment, index) => {
                const chosen = segment.value === value
                return (
                    <button
                        key={segment.value}
                        ref={(element) => {
                            buttons.current[index] = element
                        }}
                        type='button'
                        role='radio'
                        aria-checked={chosen}
                        lang={segment.lang}
                        tabIndex={chosen ? 0 : -1}
                        disabled={disabled}
                        onClick={() => choose(index)}
                        onKeyDown={(event) => keyDown(event, index)}
                        className={cn(
                            'rounded-badge border px-3 transition-colors duration-micro',
                            variant === 'view'
                                ? 'inline-flex items-center gap-1.5 text-label [&_svg]:size-3.5'
                                : 'min-w-[72px] text-body-sm',
                            segment.numeric && 'font-numeric tabular-nums',
                            'disabled:cursor-not-allowed disabled:text-text-tertiary',
                            chosen
                                ? 'border-border bg-surface-1 font-semibold text-text-primary disabled:bg-surface-3'
                                : 'border-transparent font-medium text-text-secondary hover:bg-surface-3 disabled:hover:bg-transparent'
                        )}
                    >
                        {segment.icon}
                        {segment.label}
                        {segment.suffix}
                    </button>
                )
            })}
        </div>
    )
}

import { useRef, type KeyboardEvent } from 'react'
import { CountBadge } from '@/components/ui/count-badge'
import { cn } from '@/lib/utils'

export interface TabItem<T extends string> {
    value: T
    label: string
    /** A number to act on (incoming requests): a Badge count after the label, 6 apart (C-26b, 09 R4). */
    badge?: number
    /** The Badge in words, for assistive tech ("1 incoming request"); the Badge itself is decorative. */
    badgeLabel?: string
}

interface TabsProps<T extends string> {
    /** Makes the ids of the tabs and their panels: `${id}-tab-${value}`, `${id}-panel-${value}`. */
    id: string
    value: T
    onValueChange: (value: T) => void
    tabs: readonly TabItem<T>[]
    'aria-label': string
    className?: string
}

/** The id of a tab, for its panel's `aria-labelledby`. */
export const tabId = (id: string, value: string) => `${id}-tab-${value}`

/** The props of the panel a tab shows (`role="tabpanel"`, labelled by its tab). */
export const tabPanelProps = (id: string, value: string) =>
    ({ role: 'tabpanel', id: `${id}-panel-${value}`, 'aria-labelledby': tabId(id, value) }) as const

/**
 * Tabs (C-26b): parts of one page side by side, the one shown underlined.
 * Each tab `body-sm` 500 `text-secondary`, 40 high, 24 apart; the chosen one
 * `text-primary` 600 with a 2 `primary` line under its words; a `border`
 * line under them all. ← → choose at once (going round), Home / End the
 * first and last; Tab reaches the chosen one only. The page draws the panel
 * with `tabPanelProps`.
 */
export function Tabs<T extends string>({
    id,
    value,
    onValueChange,
    tabs,
    'aria-label': label,
    className
}: TabsProps<T>) {
    const buttons = useRef<(HTMLButtonElement | null)[]>([])

    function choose(index: number) {
        const next = (index + tabs.length) % tabs.length
        const tab = tabs[next]
        if (!tab) return
        buttons.current[next]?.focus()
        if (tab.value !== value) onValueChange(tab.value)
    }

    function keyDown(event: KeyboardEvent, index: number) {
        const to = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key]
        if (to === undefined) return
        event.preventDefault()
        choose(to)
    }

    return (
        <div role='tablist' aria-label={label} className={cn('flex gap-6 border-b', className)}>
            {tabs.map((tab, index) => {
                const chosen = tab.value === value
                return (
                    <button
                        key={tab.value}
                        ref={(element) => {
                            buttons.current[index] = element
                        }}
                        type='button'
                        role='tab'
                        id={tabId(id, tab.value)}
                        aria-selected={chosen}
                        aria-label={tab.badge && tab.badgeLabel ? `${tab.label}, ${tab.badgeLabel}` : undefined}
                        aria-controls={tabPanelProps(id, tab.value).id}
                        tabIndex={chosen ? 0 : -1}
                        onClick={() => choose(index)}
                        onKeyDown={(event) => keyDown(event, index)}
                        className={cn(
                            '-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-1 text-body-sm transition-colors duration-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            chosen
                                ? 'border-primary font-semibold text-text-primary'
                                : 'border-transparent text-text-secondary hover:text-text-primary'
                        )}
                    >
                        {tab.label}
                        {tab.badge ? <CountBadge count={tab.badge} /> : null}
                    </button>
                )
            })}
        </div>
    )
}

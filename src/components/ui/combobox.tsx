import { forwardRef, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SelectOption } from '@/components/ui/select'
import { cn, folded } from '@/lib/utils'

export interface ComboboxProps {
    value: string
    onValueChange: (value: string) => void
    /** The rows, drawn like the Select's: an icon, a second line, words at the right. */
    options: SelectOption[]
    /** The search box's name and hint ("Search a city or GMT"). */
    searchLabel: string
    /** The list's name for screen readers. */
    listLabel: string
    /** The one line when nothing matches. */
    empty: string
    /** Does a row match what was typed. By default its label or the words at its right, without case or accents. */
    matches?: (option: SelectOption, query: string) => boolean
    /**
     * A row above the list while nothing is typed, with a line under it: the
     * time zone's "From your browser". While the value is the shortcut's, only
     * the shortcut is ticked.
     */
    shortcut?: SelectOption
    /** What the closed field shows when the value is not one of the rows (a zone not in the list). */
    display?: { label: string; icon?: ReactNode }
    /** Name it like any field: `id` + a `<Label htmlFor>`, or `aria-labelledby`. */
    id?: string
    'aria-labelledby'?: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
    disabled?: boolean
}

/** A row of the panel: the shortcut first while nothing is typed, then the rows that match. */
interface Row {
    key: string
    option: SelectOption
    shortcut?: boolean
}

/** What was typed, compared without case, accents or extra spaces. */
const searched = (text: string) => folded(text).replace(/\s+/g, ' ').trim()

const byLabel = (option: SelectOption, query: string) =>
    [option.label, option.trailing ?? ''].some((text) => searched(text).includes(searched(query)))

/**
 * Combobox (C-25): a 40 field that opens a panel with a search box over the
 * list, for more than ten choices (fewer: `Select`). Rows 32 (48 with a
 * description), the chosen one with a 16 `check` at the right edge.
 *
 * Keyboard: Enter or ↓ on the field opens; typing filters; ↑ ↓ move; Enter
 * picks and closes; Esc closes and keeps the value. The search box keeps the
 * focus throughout (`aria-activedescendant`), the mouse too.
 */
export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
    {
        value,
        onValueChange,
        options,
        searchLabel,
        listLabel,
        empty,
        matches = byLabel,
        shortcut,
        display,
        id,
        'aria-labelledby': labelledBy,
        'aria-describedby': describedBy,
        'aria-invalid': invalid,
        disabled
    },
    ref
) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const listId = useId()
    const listRef = useRef<HTMLUListElement>(null)

    const rows = useMemo<Row[]>(() => {
        const typed = query.trim() !== ''
        const first: Row[] = shortcut && !typed ? [{ key: 'shortcut', option: shortcut, shortcut: true }] : []
        const found = typed ? options.filter((option) => matches(option, query)) : options
        return [...first, ...found.map((option) => ({ key: option.value, option }))]
    }, [options, shortcut, matches, query])

    const shortcutTicked = shortcut?.value === value
    const shown = options.find((option) => option.value === value) ?? display
    // The rows can change while the panel is open (a channel deleted): the
    // highlight stays on the last row left rather than on one that is gone.
    const current = Math.min(active, rows.length - 1)

    function openChange(next: boolean) {
        setOpen(next)
        setQuery('')
        setActive(0)
    }

    function pick(row: Row | undefined) {
        if (!row) return
        onValueChange(row.option.value)
        openChange(false)
    }

    function moveTo(index: number) {
        const next = Math.max(0, Math.min(rows.length - 1, index))
        setActive(next)
        listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView?.({ block: 'nearest' })
    }

    function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            moveTo(current + 1)
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveTo(current - 1)
        } else if (event.key === 'Enter') {
            event.preventDefault()
            pick(rows[current])
        }
    }

    const optionId = (index: number) => `${listId}-${index}`

    return (
        <Popover open={open} onOpenChange={openChange}>
            <PopoverTrigger asChild>
                <button
                    ref={ref}
                    id={id}
                    type='button'
                    aria-haspopup='listbox'
                    aria-expanded={open}
                    aria-describedby={describedBy}
                    aria-labelledby={labelledBy}
                    disabled={disabled}
                    data-invalid={invalid || undefined}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                            event.preventDefault()
                            openChange(true)
                        }
                    }}
                    className={cn(
                        'flex h-10 w-full items-center justify-between gap-2 rounded-input border border-border-input bg-surface-1 px-3 text-left text-body-sm text-text-primary transition-colors duration-micro',
                        'hover:border-text-secondary focus:border-primary focus:shadow-[inset_0_0_0_1px_rgb(var(--primary))] focus:outline-none',
                        'data-[invalid]:border-danger',
                        'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2 disabled:text-text-tertiary'
                    )}
                >
                    <span className='inline-flex min-w-0 items-center gap-1'>
                        {shown?.icon}
                        <span className='truncate'>{shown?.label}</span>
                    </span>
                    <ChevronDown className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className='w-[var(--radix-popover-trigger-width)] p-0'
                onOpenAutoFocus={(event) => {
                    // The search box takes the focus, not the panel.
                    event.preventDefault()
                    ;(event.currentTarget as HTMLElement).querySelector('input')?.focus()
                }}
            >
                <div className='flex items-center gap-2 border-b px-3'>
                    <Search className='size-4 shrink-0 text-text-tertiary' aria-hidden='true' />
                    <input
                        type='text'
                        role='combobox'
                        aria-expanded='true'
                        aria-controls={listId}
                        aria-autocomplete='list'
                        aria-activedescendant={rows.length > 0 ? optionId(current) : undefined}
                        aria-label={searchLabel}
                        placeholder={searchLabel}
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value)
                            setActive(0)
                        }}
                        onKeyDown={onSearchKeyDown}
                        className='h-10 w-full bg-transparent text-body-sm text-text-primary outline-none placeholder:text-text-tertiary'
                    />
                </div>
                <ul
                    ref={listRef}
                    id={listId}
                    role='listbox'
                    aria-label={listLabel}
                    className='max-h-80 overflow-y-auto p-1'
                >
                    {rows.length === 0 ? (
                        <li role='presentation' className='px-2 py-1.5 text-body-sm text-text-tertiary'>
                            {empty}
                        </li>
                    ) : (
                        rows.map((row, index) => {
                            const { option } = row
                            const ticked = row.shortcut ? shortcutTicked : !shortcutTicked && option.value === value
                            return (
                                <li
                                    key={row.key}
                                    id={optionId(index)}
                                    data-index={index}
                                    role='option'
                                    aria-selected={ticked}
                                    // Mouse down, not click: the search box keeps the focus,
                                    // and with it the keyboard (↑ ↓ Enter), as C-25 asks.
                                    onMouseDown={(event) => {
                                        event.preventDefault()
                                        pick(row)
                                    }}
                                    onMouseMove={() => setActive(index)}
                                    className={cn(
                                        'relative flex cursor-pointer flex-col justify-center rounded-input py-1.5 pl-2 pr-8 text-body-sm text-text-primary',
                                        option.description ? 'min-h-12' : 'min-h-8',
                                        index === current && 'bg-surface-2',
                                        row.shortcut &&
                                            'mb-1 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-border'
                                    )}
                                >
                                    <span className='flex min-w-0 items-center gap-2'>
                                        <span className='inline-flex min-w-0 items-center gap-1'>
                                            {option.icon}
                                            <span className='truncate'>{option.label}</span>
                                        </span>
                                        {option.trailing ? (
                                            <span className='ml-auto shrink-0 text-label uppercase text-text-tertiary'>
                                                {option.trailing}
                                            </span>
                                        ) : null}
                                    </span>
                                    {option.description ? (
                                        <span className='text-label text-text-tertiary'>{option.description}</span>
                                    ) : null}
                                    {ticked ? (
                                        <Check
                                            className='absolute right-2 top-1/2 size-4 -translate-y-1/2 text-primary'
                                            aria-hidden='true'
                                        />
                                    ) : null}
                                </li>
                            )
                        })
                    )}
                </ul>
            </PopoverContent>
        </Popover>
    )
})

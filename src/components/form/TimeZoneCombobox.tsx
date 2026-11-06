import { forwardRef, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { FieldControlProps } from '@/components/form/FormField'
import {
    browserTimeZone,
    matchesTimeZone,
    timeZoneOption,
    timeZoneOptions,
    type TimeZoneOption
} from '@/lib/time-zones'
import { cn } from '@/lib/utils'

interface TimeZoneComboboxProps extends Partial<FieldControlProps> {
    /** The IANA name picked. */
    value: string
    onChange: (zone: string) => void
}

/** A row of the list: the browser's zone first (a shortcut), then every zone. */
interface Row {
    key: string
    option: TimeZoneOption
    browser?: boolean
}

/**
 * The time zone picker (C-25): a button that reads like a text field, and a
 * panel with a search box over the list. The first row is always "From your
 * browser", a shortcut that saves the browser's IANA name. While the value is
 * that zone, only that row is ticked.
 *
 * Keyboard: Enter or ↓ on the button opens; typing filters; ↑ ↓ move; Enter
 * picks and closes; Esc closes and keeps the value.
 */
export const TimeZoneCombobox = forwardRef<HTMLButtonElement, TimeZoneComboboxProps>(function TimeZoneCombobox(
    { value, onChange, id, 'aria-describedby': describedBy, 'aria-invalid': invalid },
    ref
) {
    const { t, i18n } = useTranslation()
    const language = i18n.resolvedLanguage === 'vi' ? 'vi' : 'en'
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [active, setActive] = useState(0)
    const listId = useId()
    const listRef = useRef<HTMLUListElement>(null)

    const options = useMemo(() => timeZoneOptions(language), [language])
    const browser = useMemo(() => {
        const zone = browserTimeZone()
        return zone ? timeZoneOption(zone, language) : null
    }, [language])
    const selected = useMemo(
        () => options.find((option) => option.id === value) ?? timeZoneOption(value, language),
        [options, value, language]
    )

    const rows = useMemo<Row[]>(() => {
        const found = options.filter((option) => matchesTimeZone(option, query))
        const first: Row[] = browser && !query.trim() ? [{ key: 'browser', option: browser, browser: true }] : []
        return [...first, ...found.map((option) => ({ key: option.id, option }))]
    }, [options, browser, query])

    const tickBrowserRow = browser !== null && browser.id === value

    function openChange(next: boolean) {
        setOpen(next)
        setQuery('')
        setActive(0)
    }

    function pick(row: Row | undefined) {
        if (!row) return
        onChange(row.option.id)
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
            moveTo(active + 1)
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            moveTo(active - 1)
        } else if (event.key === 'Enter') {
            event.preventDefault()
            pick(rows[active])
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
                        'data-[invalid]:border-danger'
                    )}
                >
                    <span className='whitespace-nowrap'>{selected.label}</span>
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
                        aria-activedescendant={rows.length > 0 ? optionId(active) : undefined}
                        aria-label={t('timeZone.search')}
                        placeholder={t('timeZone.search')}
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
                    aria-label={t('timeZone.list')}
                    className='max-h-80 overflow-y-auto p-1'
                >
                    {rows.length === 0 ? (
                        <li role='presentation' className='px-2 py-1.5 text-body-sm text-text-tertiary'>
                            {t('timeZone.none')}
                        </li>
                    ) : (
                        rows.map((row, index) => {
                            const ticked = row.browser ? tickBrowserRow : !tickBrowserRow && row.option.id === value
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
                                        'flex h-8 cursor-pointer items-center justify-between gap-2 rounded-input px-2 text-body-sm text-text-primary',
                                        index === active && 'bg-surface-2',
                                        row.browser &&
                                            'relative mb-1 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:bg-border'
                                    )}
                                >
                                    <span className='truncate'>
                                        {row.browser
                                            ? t('timeZone.browser', { zone: row.option.label })
                                            : row.option.label}
                                    </span>
                                    {ticked ? (
                                        <Check className='size-4 shrink-0 text-primary' aria-hidden='true' />
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

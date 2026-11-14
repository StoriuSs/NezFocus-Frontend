import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { messageKeys } from '../api/keys'
import { loadEmoji, pickerSections } from '../lib/emoji-data'
import { moveInGrid, type GridPosition } from '../lib/emoji-grid'
import { readRecent, rememberEmoji } from '../lib/emoji-recent'

/**
 * EmojiPicker (C-12, S-CHAT-03 `emoji-picker`): a Popover 320 wide with the
 * search box "Search emoji" (no accents needed), "Recently used" (this
 * person's last picks in this browser, or the frame's eight), then every
 * group, 8 to a row. Picking one closes it and remembers it. The emoji are
 * read the first time it opens, in the person's language.
 *
 * Keyboard: the search box has focus (the Popover's first field); ↓ goes into the grid, the arrow keys
 * move in it (↑ from the first row back to the box), Enter picks, Esc closes.
 * Only one emoji is in the Tab order, so Tab leaves the grid at once.
 *
 * `children` is what it hangs from: a `PopoverTrigger` (the composer's ☺) or
 * a `PopoverAnchor` (a message's toolbar or reactions). Focus goes back to
 * `returnFocus` once it closes, unless it closed on a click elsewhere: focus
 * stays where that click put it.
 */
export function EmojiPicker({
    open,
    onOpenChange,
    onPick,
    userId,
    side = 'bottom',
    align = 'end',
    returnFocus,
    children
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onPick: (emoji: string) => void
    /** Whose "Recently used" it shows. */
    userId: string | undefined
    side?: 'top' | 'bottom'
    align?: 'start' | 'end'
    /** Where focus goes once it closes (else Radix gives it back to the trigger). */
    returnFocus?: () => void
    children: ReactNode
}) {
    const { t } = useTranslation('messaging')
    const clickedOutside = useRef(false)
    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                if (next) clickedOutside.current = false
                onOpenChange(next)
            }}
        >
            {children}
            <PopoverContent
                side={side}
                align={align}
                aria-label={t('emoji.picker')}
                role='dialog'
                className='w-80 p-2'
                onPointerDownOutside={() => {
                    clickedOutside.current = true
                }}
                onCloseAutoFocus={(event) => {
                    if (clickedOutside.current) return event.preventDefault()
                    if (!returnFocus) return
                    event.preventDefault()
                    returnFocus()
                }}
            >
                <EmojiPanel
                    userId={userId}
                    onPick={(emoji) => {
                        rememberEmoji(userId, emoji)
                        onOpenChange(false)
                        onPick(emoji)
                    }}
                />
            </PopoverContent>
        </Popover>
    )
}

function EmojiPanel({ userId, onPick }: { userId: string | undefined; onPick: (emoji: string) => void }) {
    const { t, i18n } = useTranslation('messaging')
    const language = i18n.language.startsWith('vi') ? 'vi' : 'en'
    const data = useQuery({
        queryKey: messageKeys.emoji(language),
        queryFn: () => loadEmoji(language),
        staleTime: Infinity,
        gcTime: Infinity
    })
    const [query, setQuery] = useState('')
    const [at, setAt] = useState<GridPosition>({ group: 0, index: 0 })
    const search = useRef<HTMLInputElement>(null)
    const grid = useRef<HTMLDivElement>(null)
    const id = useId()

    const sections = useMemo(
        () => pickerSections(data.data, query, readRecent(userId), t),
        [data.data, query, userId, t]
    )
    const sizes = sections.map((section) => section.emojis.length)
    // A search narrows the grid: the emoji in the Tab order stays one that exists.
    const current = at.group < sections.length && at.index < sizes[at.group]! ? at : { group: 0, index: 0 }

    const focusAt = (position: GridPosition) => {
        setAt(position)
        grid.current?.querySelector<HTMLButtonElement>(`[data-at="${position.group}:${position.index}"]`)?.focus()
    }
    const gridKey = (event: KeyboardEvent<HTMLButtonElement>) => {
        const next = moveInGrid(sizes, current, event.key)
        if (!next) return
        event.preventDefault()
        if (next === 'search') search.current?.focus()
        else focusAt(next)
    }

    return (
        <div className='flex flex-col gap-2'>
            <label className='flex h-8 items-center gap-2 rounded-input bg-surface-2 px-3 text-text-tertiary'>
                <Search className='size-3.5 shrink-0' aria-hidden='true' />
                <input
                    ref={search}
                    type='search'
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'ArrowDown' || !sizes.some(Boolean)) return
                        event.preventDefault()
                        focusAt(current)
                    }}
                    aria-label={t('emoji.search')}
                    placeholder={t('emoji.search')}
                    className='min-w-0 flex-1 bg-transparent text-label text-text-primary outline-none placeholder:text-text-tertiary'
                />
            </label>
            {data.isError ? (
                <div className='flex flex-col items-center gap-2 py-6'>
                    <p className='text-label text-text-secondary'>{t('emoji.loadError')}</p>
                    <Button variant='secondary' onClick={() => void data.refetch()}>
                        {t('emoji.retry')}
                    </Button>
                </div>
            ) : (
                <div ref={grid} className='flex max-h-80 flex-col gap-2 overflow-y-auto'>
                    {sections.map((section, group) => (
                        <section key={section.key} aria-labelledby={`${id}-${section.key}`}>
                            <h3
                                id={`${id}-${section.key}`}
                                className='px-1 pb-1 text-micro font-semibold uppercase text-text-tertiary'
                            >
                                {section.title}
                            </h3>
                            <div className='grid grid-cols-8 gap-1'>
                                {section.emojis.map(({ emoji, label }, index) => (
                                    <button
                                        key={emoji}
                                        type='button'
                                        data-at={`${group}:${index}`}
                                        tabIndex={current.group === group && current.index === index ? 0 : -1}
                                        aria-label={label}
                                        onClick={() => onPick(emoji)}
                                        onFocus={() => setAt({ group, index })}
                                        onKeyDown={gridKey}
                                        className='flex aspect-square items-center justify-center rounded-input text-title-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                    {query && data.data && !sizes.some(Boolean) ? (
                        <p role='status' className='py-6 text-center text-label text-text-secondary'>
                            {t('emoji.noResults')}
                        </p>
                    ) : null}
                    {data.isPending ? (
                        <p role='status' className='py-4 text-center text-label text-text-tertiary'>
                            {t('emoji.loading')}
                        </p>
                    ) : null}
                </div>
            )}
        </div>
    )
}

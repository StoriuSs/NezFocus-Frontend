import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { PANEL_DOCKS, useMediaQuery } from '@/hooks/useMediaQuery'
import { safeLocalStorage } from '@/lib/safe-storage'
import { cn } from '@/lib/utils'

export interface PanelState {
    /** On screen now, whichever form it has. */
    open: boolean
    /** A column beside the content (≥ 1280), or a sheet over it. */
    docked: boolean
    toggle: () => void
    close: () => void
}

/**
 * Open / closed for one kind of right panel (C-08). As a column (≥ 1280) the
 * choice is remembered in this browser, per kind, and it starts open, or
 * closed with `startClosed` (the pins, SRS 1.71); as a
 * sheet over the content it starts closed and is not remembered, so a narrow
 * window never opens with the content covered.
 *
 * Also returns the ref for the header button that opens it: focus goes back
 * there when the sheet closes.
 */
export function usePanel(
    kind: string,
    { startClosed = false }: { startClosed?: boolean } = {}
): [PanelState, RefObject<HTMLButtonElement | null>] {
    const docked = useMediaQuery(PANEL_DOCKS)
    const key = `panel:${kind}`
    const [columnOpen, setColumnOpen] = useState(() => {
        const stored = safeLocalStorage.get(key)
        return stored === null ? !startClosed : stored !== 'closed'
    })
    const [sheetOpen, setSheetOpen] = useState(false)
    const buttonRef = useRef<HTMLButtonElement | null>(null)

    const setColumn = useCallback(
        (open: boolean) => {
            setColumnOpen(open)
            safeLocalStorage.set(key, open ? 'open' : 'closed')
        },
        [key]
    )

    const toggle = useCallback(
        () => (docked ? setColumn(!columnOpen) : setSheetOpen((open) => !open)),
        [docked, columnOpen, setColumn]
    )
    const close = useCallback(() => (docked ? setColumn(false) : setSheetOpen(false)), [docked, setColumn])

    return [{ open: docked ? columnOpen : sheetOpen, docked, toggle, close }, buttonRef]
}

/**
 * RightPanel (C-08): 280 wide, `surface-1`, a 48-high header with the title.
 * As a sheet it also has a close button, and Esc or a click outside closes
 * it, giving focus back to the button that opened it; a menu opened from it
 * (drawn elsewhere in the page) counts as inside, and Esc closes that first.
 */
export function RightPanel({
    state,
    buttonRef,
    title,
    children
}: {
    state: PanelState
    buttonRef: RefObject<HTMLButtonElement | null>
    title: string
    children: ReactNode
}) {
    const { t } = useTranslation()
    const ref = useRef<HTMLElement>(null)
    const { open, docked, close } = state
    const sheet = open && !docked
    const closeAndReturn = useCallback(() => {
        close()
        buttonRef.current?.focus()
    }, [close, buttonRef])

    useEffect(() => {
        if (!sheet) return
        // Esc that closed a menu of the sheet (Radix marks it handled) leaves the sheet open.
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented) closeAndReturn()
        }
        // A menu opened from the sheet is drawn outside it (a portal): a click there is not outside.
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Element
            if (ref.current?.contains(target) || buttonRef.current?.contains(target)) return
            if (target.closest?.('[data-radix-popper-content-wrapper]')) return
            close()
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPointer)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.removeEventListener('pointerdown', onPointer)
        }
    }, [sheet, close, closeAndReturn, buttonRef])

    if (!open) return null
    return (
        <aside
            ref={ref}
            aria-label={title}
            className={cn(
                'flex w-panel shrink-0 flex-col border-l bg-surface-1',
                sheet && 'fixed inset-y-0 right-0 z-40 shadow-sheet-right'
            )}
        >
            <header className='flex h-12 shrink-0 items-center gap-2 border-b pl-4 pr-2'>
                <h2 className='flex-1 truncate text-headline text-text-primary'>{title}</h2>
                {sheet ? (
                    <WithTooltip label={t('shell.closePanel')} side='bottom'>
                        <IconButton label={t('shell.closePanel')} onClick={closeAndReturn}>
                            <X />
                        </IconButton>
                    </WithTooltip>
                ) : null}
            </header>
            <div className='min-h-0 flex-1 overflow-y-auto p-2'>{children}</div>
        </aside>
    )
}

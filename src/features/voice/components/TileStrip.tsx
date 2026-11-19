import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { hiddenEnds, type Ends } from '../lib/share'

/**
 * The strip of tiles above a shared screen (C-31 › Dải trên, D-102): the
 * people's `video · strip` tiles 8 apart, in one row that scrolls sideways
 * (a trackpad, Shift + the wheel); ‹ / › (IconButton 32 on `scrim`, "See
 * more people") only at an end that hides someone. The page gives the tiles
 * and their keyboard (one stop, ← →): a tile focused scrolls into view.
 */
export function TileStrip({ label, children }: { label: string; children: ReactNode }) {
    const { t } = useTranslation('voice')
    const row = useRef<HTMLUListElement>(null)
    const [ends, setEnds] = useState<Ends>({ before: false, after: false })
    const measure = useCallback(() => {
        const element = row.current
        if (!element) return
        const next = hiddenEnds(element)
        setEnds((now) => (now.before === next.before && now.after === next.after ? now : next))
    }, [])
    // People come and go: the ends again when their number changes (not at each speaker's turn).
    const count = Children.count(children)
    useLayoutEffect(measure, [measure, count])
    useEffect(() => {
        const element = row.current
        if (!element) return
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [measure])
    const page = (direction: 1 | -1) => {
        const element = row.current
        if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' })
    }
    const more = t('stage.more')
    return (
        <div className='relative flex min-w-0 flex-1'>
            <ul
                ref={row}
                aria-label={label}
                onScroll={measure}
                className='flex min-w-0 flex-1 gap-2'
                // 4 around the tiles inside the scroller, taken back outside: room for their focus ring.
                style={{ overflowX: 'auto', scrollbarWidth: 'none', margin: -4, padding: 4 }}
            >
                {children}
            </ul>
            {ends.before ? <Edge side='left' label={more} onClick={() => page(-1)} /> : null}
            {ends.after ? <Edge side='right' label={more} onClick={() => page(1)} /> : null}
        </div>
    )
}

function Edge({ side, label, onClick }: { side: 'left' | 'right'; label: string; onClick: () => void }) {
    return (
        <WithTooltip label={label}>
            <IconButton
                label={label}
                onClick={onClick}
                className='absolute top-1/2 -translate-y-1/2 bg-scrim text-text-primary hover:bg-surface-3'
                style={{ [side]: 4 }}
            >
                {side === 'left' ? <ChevronLeft /> : <ChevronRight />}
            </IconButton>
        </WithTooltip>
    )
}

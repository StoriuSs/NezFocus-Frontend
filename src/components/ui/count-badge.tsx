import { cn } from '@/lib/utils'

/**
 * Badge `count` (C-03): 18 high, `danger` with `micro` 600 numbers in `bg`;
 * 1–99, then "99+"; nothing at 0. Decorative: the label of what it sits on
 * says the count in words ("2 mentions of you unread").
 */
export function CountBadge({ count, cutout, className }: { count: number; cutout?: string; className?: string }) {
    if (count <= 0) return null
    return (
        <span
            aria-hidden='true'
            className={cn(
                'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-[5px] text-micro text-bg',
                cutout && `ring-2 ${cutout}`,
                className
            )}
        >
            {count > 99 ? '99+' : count}
        </span>
    )
}

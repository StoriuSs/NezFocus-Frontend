import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OptionCardItem<T extends string> {
    value: T
    icon: LucideIcon
    title: string
    /** A Tag on its own line under the title ("Gợi ý", C-36). */
    tag?: string
    description: ReactNode
}

interface OptionCardsProps<T extends string> {
    /** The group's name for assistive technology ("Mẫu server"). */
    label: string
    value: T
    onChange: (value: T) => void
    options: OptionCardItem<T>[]
    disabled?: boolean
    className?: string
}

/**
 * OptionCard (C-37): one of two or three choices that need more than a line
 * to describe. A radio group with one tab stop; arrow keys move and choose.
 * Selected reads without colour: a filled radio and a 2 border.
 */
export function OptionCards<T extends string>({
    label,
    value,
    onChange,
    options,
    disabled,
    className
}: OptionCardsProps<T>) {
    const cards = useRef<(HTMLButtonElement | null)[]>([])

    function onKeyDown(event: KeyboardEvent, index: number) {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
        if (!step || disabled) return
        event.preventDefault()
        const next = (index + step + options.length) % options.length
        onChange(options[next]!.value)
        cards.current[next]?.focus()
    }

    return (
        <div role='radiogroup' aria-label={label} className={cn('grid grid-cols-2 gap-3', className)}>
            {options.map((option, index) => {
                const checked = option.value === value
                const Icon = option.icon
                return (
                    <button
                        key={option.value}
                        ref={(element) => {
                            cards.current[index] = element
                        }}
                        type='button'
                        role='radio'
                        aria-checked={checked}
                        disabled={disabled}
                        tabIndex={checked ? 0 : -1}
                        onClick={() => onChange(option.value)}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        className={cn(
                            'flex flex-col items-start gap-2 rounded-button bg-surface-1 p-4 text-left transition-colors duration-micro',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                            checked ? 'border-2 border-primary p-[15px]' : 'border border-border hover:bg-surface-2',
                            disabled && 'cursor-default hover:bg-surface-1'
                        )}
                    >
                        <span className='flex w-full items-center gap-2'>
                            <Icon
                                className={cn('size-5 shrink-0', checked ? 'text-text-primary' : 'text-text-secondary')}
                                aria-hidden='true'
                            />
                            <span className='min-w-0 flex-1 text-body-sm font-semibold text-text-primary'>
                                {option.title}
                            </span>
                            <span
                                aria-hidden='true'
                                className={cn(
                                    'flex size-4 shrink-0 items-center justify-center rounded-full',
                                    checked ? 'bg-primary' : 'border border-border-input'
                                )}
                            >
                                {checked ? <span className='size-1.5 rounded-full bg-on-primary' /> : null}
                            </span>
                        </span>
                        {option.tag ? (
                            <span className='rounded-badge bg-surface-3 px-1.5 py-0.5 text-label font-semibold text-text-secondary'>
                                {option.tag}
                            </span>
                        ) : null}
                        <span className='text-label text-text-secondary'>{option.description}</span>
                    </button>
                )
            })}
        </div>
    )
}

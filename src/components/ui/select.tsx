import * as SelectPrimitive from '@radix-ui/react-select'
import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
    value: string
    label: string
    /** A second line (the row grows to 48), e.g. "Kênh nằm trên cùng danh sách". */
    description?: string
    /** Before the label, in the field too: a 12 `lock` for a private channel. */
    icon?: ReactNode
    /** At the right of the row only (`label`, `text-tertiary`): a channel's category. */
    trailing?: string
}

interface SelectProps {
    value: string
    onValueChange: (value: string) => void
    options: SelectOption[]
    /** Name it like any field: `id` + a `<Label htmlFor>`, or `aria-label`. */
    id?: string
    'aria-label'?: string
    'aria-describedby'?: string
    disabled?: boolean
    /** Shown as given (category names in capitals: `uppercase`). */
    labelClassName?: string
    className?: string
}

/**
 * Select (C-25 `select`): a 40 field with `chevron-down` that opens a list
 * without a search box, for ten choices or fewer. Rows 32 (48 with a
 * description), the chosen one with a 16 `check` at the right edge. Keyboard
 * as Radix Select: Enter / Space / ↓ open, ↑ ↓ move, Enter chooses, Esc
 * closes keeping the old value, a letter jumps to the row it starts.
 */
export function Select({
    value,
    onValueChange,
    options,
    id,
    disabled,
    labelClassName,
    className,
    ...aria
}: SelectProps) {
    return (
        <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
            <SelectPrimitive.Trigger
                id={id}
                {...aria}
                className={cn(
                    'flex h-10 w-full items-center justify-between gap-2 rounded-input border border-border-input bg-surface-1 px-3 text-left text-body-sm text-text-primary transition-colors duration-micro',
                    'hover:border-text-secondary focus:border-primary focus:shadow-[inset_0_0_0_1px_rgb(var(--primary))] focus:outline-none',
                    'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2 disabled:text-text-tertiary',
                    className
                )}
            >
                <span className={cn('min-w-0 truncate', labelClassName)}>
                    <SelectPrimitive.Value />
                </span>
                <SelectPrimitive.Icon asChild>
                    <ChevronDown className='size-4 shrink-0 text-text-tertiary' aria-hidden='true' />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>
            <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                    position='popper'
                    sideOffset={4}
                    className='z-50 max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-button border bg-surface-1 text-text-primary shadow-float'
                >
                    <SelectPrimitive.Viewport className='p-1'>
                        {options.map((option) => (
                            <SelectPrimitive.Item
                                key={option.value}
                                value={option.value}
                                className={cn(
                                    'relative flex cursor-pointer select-none flex-col justify-center rounded-input py-1.5 pl-2 pr-8 text-body-sm outline-none transition-colors duration-micro data-[highlighted]:bg-surface-2',
                                    option.description ? 'min-h-12' : 'min-h-8'
                                )}
                            >
                                <span className='flex min-w-0 items-center gap-2'>
                                    <SelectPrimitive.ItemText>
                                        <span className='inline-flex min-w-0 items-center gap-1'>
                                            {option.icon}
                                            <span className={cn('truncate', labelClassName)}>{option.label}</span>
                                        </span>
                                    </SelectPrimitive.ItemText>
                                    {option.trailing ? (
                                        <span className='ml-auto shrink-0 text-label uppercase text-text-tertiary'>
                                            {option.trailing}
                                        </span>
                                    ) : null}
                                </span>
                                {option.description ? (
                                    <span className='text-label text-text-tertiary'>{option.description}</span>
                                ) : null}
                                <SelectPrimitive.ItemIndicator className='absolute right-2 top-1/2 -translate-y-1/2'>
                                    <Check className='size-4' aria-hidden='true' />
                                </SelectPrimitive.ItemIndicator>
                            </SelectPrimitive.Item>
                        ))}
                    </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    )
}

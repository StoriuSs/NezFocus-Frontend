import { useId, type ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/**
 * A settings row with a switch (C-27 SettingsRow + C-24a): the label on the
 * left, its description under it, the switch on the right. The label is a
 * `<label>` for the switch, so clicking the words flips it too.
 *
 * `className` changes the row's own spacing: a dialog's form spaces its
 * fields itself and lines the switch up with the label (S-SRV-05).
 */
export function SwitchRow({
    label,
    description,
    checked,
    onCheckedChange,
    disabled,
    className
}: {
    label: string
    description?: ReactNode
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    disabled?: boolean
    className?: string
}) {
    const id = useId()
    return (
        <div className={cn('flex items-center gap-4 py-2', className)}>
            <div className='min-w-0 flex-1'>
                <label
                    htmlFor={id}
                    className={cn('block text-body-sm text-text-primary', !disabled && 'cursor-pointer')}
                >
                    {label}
                </label>
                {description ? (
                    <p id={`${id}-description`} className='max-w-md text-label text-text-tertiary'>
                        {description}
                    </p>
                ) : null}
            </div>
            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                aria-describedby={description ? `${id}-description` : undefined}
            />
        </div>
    )
}

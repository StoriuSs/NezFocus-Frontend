import { useId, type ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'

/**
 * A settings row with a switch (C-27 SettingsRow + C-24a): the label on the
 * left, its description under it, the switch on the right. The label is a
 * `<label>` for the switch, so clicking the words flips it too.
 */
export function SwitchRow({
    label,
    description,
    checked,
    onCheckedChange
}: {
    label: string
    description?: ReactNode
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}) {
    const id = useId()
    return (
        <div className='flex items-center gap-4 py-2'>
            <div className='min-w-0 flex-1'>
                <label htmlFor={id} className='block cursor-pointer text-body-sm text-text-primary'>
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
                aria-describedby={description ? `${id}-description` : undefined}
            />
        </div>
    )
}

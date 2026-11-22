import type { Ref } from 'react'
import { FormField } from '@/components/form/FormField'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A number in a range (C-22, the P0 number field): the label over a 40-high
 * field, the number in `numeric-inline`, an optional unit at its end ("phút")
 * in `label` `text-tertiary`, the error under it. Takes digits only, three at
 * most; ↑ / ↓ step it by one through `onStep`, which keeps it in range. The
 * range is checked when the form is sent, not while typing.
 */
export function NumberField({
    label,
    value,
    onChange,
    onStep,
    unit,
    error,
    readOnly,
    inputRef
}: {
    label: string
    value: string
    onChange: (value: string) => void
    onStep: (step: 1 | -1) => void
    unit?: string
    error?: string
    readOnly?: boolean
    inputRef?: Ref<HTMLInputElement>
}) {
    return (
        <FormField label={label} error={error}>
            {(field) => (
                <div className='relative'>
                    <Input
                        ref={inputRef}
                        {...field}
                        value={value}
                        readOnly={readOnly}
                        inputMode='numeric'
                        autoComplete='off'
                        className={cn('font-numeric text-numeric-inline tabular-nums', unit && 'pr-12')}
                        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 3))}
                        onKeyDown={(event) => {
                            const step = { ArrowUp: 1, ArrowDown: -1 }[event.key] as 1 | -1 | undefined
                            if (step === undefined || readOnly) return
                            event.preventDefault()
                            onStep(step)
                        }}
                    />
                    {unit ? (
                        <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-label text-text-tertiary'>
                            {unit}
                        </span>
                    ) : null}
                </div>
            )}
        </FormField>
    )
}

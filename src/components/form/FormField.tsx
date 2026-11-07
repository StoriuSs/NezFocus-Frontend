import { useId, type ReactNode } from 'react'
import { OctagonX } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface FieldControlProps {
    id: string
    'aria-invalid': boolean
    'aria-describedby': string | undefined
}

interface FormFieldProps {
    label: ReactNode
    /** The validation message, e.g. react-hook-form's `errors.name?.message`. */
    error?: string
    /**
     * A line about the field's state, shown while there is no error: "Checking…",
     * "Caps Lock is on". Read out when it changes.
     */
    status?: ReactNode
    /** Help text shown under the control while there is no error or status. */
    hint?: ReactNode
    /**
     * A link at the end of the label's row ("Forgot password?", S-AUTH-03).
     * Shown there, but after the control in the tab order.
     */
    action?: ReactNode
    /** Renders the control; spread the props onto it. */
    children: (control: FieldControlProps) => ReactNode
    className?: string
}

/**
 * Label, control and the line under it (C-22), wired together for assistive
 * technology: the label targets the control, and the control points at its
 * line through aria-describedby and reports aria-invalid. Hand-written fields
 * each had to remember this and mostly didn't.
 *
 * One line under the field, first that applies: the error (icon `octagon-x`
 * and `danger` text), then the status, then the hint (`text-tertiary`).
 *
 * <FormField label={t('email')} error={errors.email?.message}>
 *     {(control) => <Input type='email' {...control} {...register('email')} />}
 * </FormField>
 */
export function FormField({ label, error, status, hint, action, children, className = 'grid gap-1' }: FormFieldProps) {
    const id = useId()
    const messageId = `${id}-message`
    const hasMessage = Boolean(error || status || hint)

    return (
        <div className={cn(className, action && 'grid-cols-[1fr_auto]')}>
            <Label htmlFor={id} className={cn('text-label text-text-secondary', action && 'row-start-1 self-center')}>
                {label}
            </Label>
            <div className={cn('contents', action && '[&>*]:col-span-2')}>
                {children({
                    id,
                    'aria-invalid': Boolean(error),
                    'aria-describedby': hasMessage ? messageId : undefined
                })}
            </div>
            {action ? <div className='col-start-2 row-start-1 text-label'>{action}</div> : null}
            {error ? (
                <p
                    id={messageId}
                    className={cn('flex gap-1.5 text-label text-danger', action && 'col-span-2')}
                    role='alert'
                >
                    <OctagonX className='mt-[3px] size-3.5 shrink-0' aria-hidden='true' />
                    <span>{error}</span>
                </p>
            ) : status ? (
                <p
                    id={messageId}
                    className={cn('flex gap-1.5 text-label text-text-secondary', action && 'col-span-2')}
                    aria-live='polite'
                >
                    {status}
                </p>
            ) : hint ? (
                <p id={messageId} className={cn('text-label text-text-tertiary', action && 'col-span-2')}>
                    {hint}
                </p>
            ) : null}
        </div>
    )
}

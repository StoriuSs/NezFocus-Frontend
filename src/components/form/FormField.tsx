import { useId, type ReactNode } from 'react'
import { Label } from '@/components/ui/label'

export interface FieldControlProps {
    id: string
    'aria-invalid': boolean
    'aria-describedby': string | undefined
}

interface FormFieldProps {
    label: ReactNode
    /** The validation message, e.g. react-hook-form's `errors.name?.message`. */
    error?: string
    /** Help text shown under the control while there is no error. */
    hint?: ReactNode
    /** Renders the control; spread the props onto it. */
    children: (control: FieldControlProps) => ReactNode
    className?: string
}

/**
 * Label, control and message, wired together for assistive technology: the
 * label targets the control, and the control points at its error or hint
 * through aria-describedby and reports aria-invalid. Hand-written fields each
 * had to remember this and mostly didn't.
 *
 * <FormField label={t('email')} error={errors.email?.message}>
 *     {(control) => <Input type='email' {...control} {...register('email')} />}
 * </FormField>
 */
export function FormField({ label, error, hint, children, className = 'grid gap-2' }: FormFieldProps) {
    const id = useId()
    const messageId = `${id}-message`
    const hasMessage = Boolean(error || hint)

    return (
        <div className={className}>
            <Label htmlFor={id}>{label}</Label>
            {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': hasMessage ? messageId : undefined })}
            {error ? (
                <p id={messageId} className='text-sm text-destructive' role='alert'>
                    {error}
                </p>
            ) : hint ? (
                <p id={messageId} className='text-xs text-muted-foreground'>
                    {hint}
                </p>
            ) : null}
        </div>
    )
}

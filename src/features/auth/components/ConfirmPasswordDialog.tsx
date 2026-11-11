import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { useCountdown } from '@/hooks/useCountdown'
import { formatWait } from '@/features/auth/lib/form-errors'
import { requestFailure, useMessageText, type RequestFailure } from '@/features/auth/lib/form-problem'
import { sendResetCode } from '@/features/auth/lib/reset-code'
import type { Limit } from '@/features/auth/hooks/useCodeReset'
import { PasswordDialog } from './ChangePasswordDialog'
import { PasswordInput } from './PasswordInput'

export interface ConfirmPasswordDialogProps {
    /** The account's email: what "Forgot password?" sends the code to. */
    email: string
    username?: string | null
    title: string
    description: ReactNode
    /** Above the field; "Password" when left out. */
    label?: string
    submitLabel: string
    /** Sends the password. Resolves once done (the caller closes the dialog); throws when refused. */
    onConfirm: (password: string) => Promise<void>
    /** Words for a refusal only the caller knows; null for the usual message. */
    describeError?: (error: unknown) => string | null
    onClose: () => void
}

/**
 * A step that asks for the account's password before something that cannot
 * be taken back (C-14 `password`): deleting the account (S-ME-03), handing a
 * server over (04 S-SET-07). The button stays off until something is typed.
 * A wrong password is said under the field, which empties (C-14); wrong ones
 * count as when changing it, five in 15 minutes, and the button waits it out
 * (D-121).
 *
 * "Forgot password?" sends a code and puts the password dialog on it in this
 * one's place (D-74); its Back, or a new password set, comes back here with
 * the field empty (10 S-ME-03 › Tương tác). Mounted while open: the caller
 * shows it, and `onClose` hides it.
 *
 * Other features open it through the auth index, which loads it on first use.
 */
export default function ConfirmPasswordDialog(props: ConfirmPasswordDialogProps) {
    const [reset, setReset] = useState<{ failure: RequestFailure | null } | null>(null)
    // A new key when coming back: the step starts empty again.
    const [round, setRound] = useState(0)

    function backHere() {
        setReset(null)
        setRound((count) => count + 1)
    }

    if (reset) {
        return (
            <PasswordDialog
                email={props.email}
                username={props.username}
                open
                startWith={{ kind: 'code', failure: reset.failure }}
                onClose={props.onClose}
                onBack={backHere}
                onDone={backHere}
            />
        )
    }
    return <PasswordStep key={round} {...props} onForgot={(failure) => setReset({ failure })} />
}

function PasswordStep({
    email,
    title,
    description,
    label,
    submitLabel,
    onConfirm,
    describeError,
    onClose,
    onForgot
}: ConfirmPasswordDialogProps & { onForgot: (failure: RequestFailure | null) => void }) {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const [problem, setProblem] = useState<string | RequestFailure | null>(null)
    const [limit, setLimit] = useState<Limit | null>(null)
    const [sendingCode, setSendingCode] = useState(false)
    const wait = useCountdown(limit?.until)
    const limited = limit !== null && wait > 0

    const {
        register,
        handleSubmit,
        control,
        setError,
        setValue,
        setFocus,
        formState: { errors, isSubmitting }
    } = useForm<{ password: string }>({ defaultValues: { password: '' } })
    const password = useWatch({ control, name: 'password' })
    const busy = isSubmitting || sendingCode

    async function submit({ password: value }: { password: string }) {
        setProblem(null)
        try {
            await onConfirm(value)
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) setLimit(failure.limit)
            else if (failure.type === 'AUTH_CURRENT_PASSWORD_INVALID') {
                // Emptied, with the words under it and the focus back (C-14 `password`).
                setValue('password', '')
                setError('password', { message: t('confirmPassword.wrong') }, { shouldFocus: true })
            } else setProblem(describeError?.(error) ?? failure)
        }
    }

    async function forgot() {
        setSendingCode(true)
        const failure = await sendResetCode(email)
        setSendingCode(false)
        onForgot(failure)
    }

    return (
        <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
            <DialogContent
                className='sm:max-w-dialog'
                // Never closed by a click outside (C-14 `password`).
                onInteractOutside={(event) => event.preventDefault()}
                // The password, not "Forgot password?" before it.
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    setFocus('password')
                }}
            >
                <form onSubmit={(event) => void handleSubmit(submit)(event)} className='space-y-4' noValidate>
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
                    {/* What a password manager fills the password in for. */}
                    <input type='email' autoComplete='username' value={email} readOnly hidden />
                    <FormField
                        label={label ?? t('fields.password')}
                        error={errors.password?.message}
                        action={
                            <button
                                type='button'
                                className='font-semibold text-primary hover:underline'
                                disabled={busy}
                                onClick={() => void forgot()}
                            >
                                {t('settings.changePassword.forgot')}
                            </button>
                        }
                    >
                        {(field) => (
                            <PasswordInput
                                autoComplete='current-password'
                                readOnly={isSubmitting}
                                {...field}
                                {...register('password')}
                            />
                        )}
                    </FormField>
                    {limited ? (
                        <FormMessage tone='neutral' icon='clock'>
                            {t('confirmPassword.tooManyWrong', { wait: formatWait(wait) })}
                        </FormMessage>
                    ) : typeof problem === 'string' ? (
                        <FormMessage tone='danger'>{problem}</FormMessage>
                    ) : problem ? (
                        <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
                            {text(problem.message)}
                        </FormMessage>
                    ) : null}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type='button' variant='text' disabled={busy}>
                                {t('settings.changePassword.cancel')}
                            </Button>
                        </DialogClose>
                        {/* Off until the password is typed (C-14 `password`, as the base). */}
                        <Button type='submit' variant='destructive' disabled={!password || busy || limited}>
                            {isSubmitting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' aria-hidden='true' /> : null}
                            {submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

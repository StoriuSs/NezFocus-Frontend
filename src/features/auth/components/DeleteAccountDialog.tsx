import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog'
import { FormField } from '@/components/form/FormField'
import { useSendAccountDeletionCode } from '@/features/auth/api/useSendAccountDeletionCode'
import { useDeleteAccount } from '@/features/auth/api/useDeleteAccount'
import { useAuthStore } from '@/features/auth/auth.store'
import { authFormError } from '@/features/auth/lib/form-errors'
import { authFields } from '@/features/auth/lib/schemas'
import { useResendCooldown } from '@/features/auth/hooks/useResendCooldown'
import { recordCodeSent, RESEND_AFTER_SECONDS, secondsUntilResend } from '@/features/auth/lib/code-sent'
import { Notice } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { useSignInMethods } from '@/features/auth/api/useSignInMethods'

/** What this account must give to prove it is the owner, as the API asks. */
interface Needs {
    /** The password; false for an account made with Google, which gets an emailed code instead. */
    password: boolean
}

const createSchema = (t: TFunction<'auth'>, needs: Needs) =>
    z.object({ password: z.string(), code: z.string() }).superRefine((values, ctx) => {
        if (needs.password) {
            if (!values.password) {
                ctx.addIssue({ code: 'custom', path: ['password'], message: t('validation.passwordRequired') })
            }
            return
        }
        const result = authFields(t).code.safeParse(values.code)
        if (!result.success) {
            ctx.addIssue({ code: 'custom', path: ['code'], message: result.error.issues[0]?.message ?? '' })
        }
    })

type Values = z.input<ReturnType<typeof createSchema>>

/**
 * "Delete account", for the profile page: a dialog that says what deleting
 * means and asks for proof it is the owner before anything happens — the
 * password, or for an account made with Google a code emailed to it. A
 * signed-in session alone is not enough:
 * the API refuses without the proof (the backend's POST /auth/account/delete).
 */
export function DeleteAccountDialog() {
    const { t } = useTranslation('auth')
    const email = useAuthStore((state) => state.user?.email)
    const logout = useAuthStore((state) => state.logout)
    const [open, setOpen] = useState(false)
    const [codeSent, setCodeSent] = useState(false)
    const [sending, setSending] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const cooldown = useResendCooldown(0)

    // Read when the dialog opens: they decide which fields it shows.
    const methods = useSignInMethods(open)
    const sendDeletionCode = useSendAccountDeletionCode()
    const deleteAccount = useDeleteAccount()
    const needs = useMemo<Needs | null>(
        () => (methods.data ? { password: methods.data.password } : null),
        [methods.data]
    )

    const schema = useMemo(() => createSchema(t, needs ?? { password: true }), [t, needs])
    const {
        register,
        handleSubmit,
        control,
        reset,
        setError,
        formState: { errors, isSubmitting }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { password: '', code: '' }
    })
    const [password, code] = useWatch({ control, name: ['password', 'code'] })
    const filled = needs !== null && (needs.password ? password.length > 0 : code.trim().length > 0)

    function onOpenChange(next: boolean) {
        setOpen(next)
        if (next) {
            // A code sent a moment ago, before a reload or a close: wait out its minute.
            const wait = secondsUntilResend('account-delete', email)
            setCodeSent(wait > 0)
            cooldown.start(wait)
        } else {
            reset()
            setFormError(null)
        }
    }

    async function sendCode() {
        setFormError(null)
        setSending(true)
        try {
            await sendDeletionCode.mutateAsync()
            if (email) recordCodeSent('account-delete', email)
            setCodeSent(true)
            cooldown.start(RESEND_AFTER_SECONDS)
        } catch (error) {
            const failure = authFormError(error)
            if (failure.retryAfterSeconds) cooldown.start(failure.retryAfterSeconds)
            setFormError(failure.message)
        } finally {
            setSending(false)
        }
    }

    async function onSubmit(values: Values) {
        if (!needs) return
        setFormError(null)
        try {
            await deleteAccount.mutateAsync(
                needs.password ? { password: values.password } : { code: authFields(t).code.parse(values.code) }
            )
            logout('account-deleted')
        } catch (error) {
            const failure = authFormError(error)
            if (failure.type === 'AUTH_CURRENT_PASSWORD_INVALID') {
                setError('password', { message: t('deleteAccount.wrongPassword') })
            } else if (failure.type === 'AUTH_CODE_INVALID' || failure.type === 'AUTH_CODE_EXPIRED') {
                setError('code', { message: failure.message })
            } else {
                setFormError(failure.message)
            }
        }
    }

    const body = () => {
        if (methods.isError) return <Notice tone='error'>{t('deleteAccount.loadFailed')}</Notice>
        if (!needs) return <p className='text-sm text-muted-foreground'>{t('deleteAccount.loading')}</p>
        return (
            <form id='delete-account' onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                {/* What a password manager fills the password in for. */}
                <input type='email' autoComplete='username' value={email ?? ''} readOnly hidden />
                {needs.password ? (
                    <>
                        <p className='text-sm'>{t('deleteAccount.confirmWithPassword')}</p>
                        <FormField label={t('fields.password')} error={errors.password?.message}>
                            {(field) => (
                                <PasswordInput autoComplete='current-password' {...field} {...register('password')} />
                            )}
                        </FormField>
                    </>
                ) : (
                    <>
                        <p className='text-sm'>{t('deleteAccount.confirmWithCode')}</p>
                        {codeSent ? <Notice tone='info'>{t('deleteAccount.codeSent', { email })}</Notice> : null}
                        <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={sending || cooldown.remaining > 0}
                            onClick={() => void sendCode()}
                        >
                            {sending
                                ? t('deleteAccount.sending')
                                : cooldown.remaining > 0
                                  ? t('deleteAccount.resendIn', { seconds: cooldown.remaining })
                                  : t('deleteAccount.sendCode')}
                        </Button>
                        <FormField label={t('fields.code')} error={errors.code?.message}>
                            {(field) => (
                                <Input
                                    inputMode='numeric'
                                    autoComplete='one-time-code'
                                    maxLength={7}
                                    className='max-w-48 text-center text-lg tracking-[0.5em]'
                                    {...field}
                                    {...register('code')}
                                />
                            )}
                        </FormField>
                    </>
                )}
            </form>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant='destructive' size='sm'>
                    <Trash2 className='mr-2 h-4 w-4' />
                    {t('deleteAccount.open')}
                </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[440px]'>
                <DialogHeader>
                    <DialogTitle className='text-destructive'>{t('deleteAccount.title')}</DialogTitle>
                    <DialogDescription>{t('deleteAccount.description')}</DialogDescription>
                </DialogHeader>
                {formError ? <Notice tone='error'>{formError}</Notice> : null}
                {body()}
                <DialogFooter className='mt-2'>
                    <Button variant='outline' onClick={() => onOpenChange(false)}>
                        {t('deleteAccount.cancel')}
                    </Button>
                    <Button
                        type='submit'
                        form='delete-account'
                        variant='destructive'
                        disabled={!filled || isSubmitting}
                    >
                        {isSubmitting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
                        {isSubmitting ? t('deleteAccount.submitting') : t('deleteAccount.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { authApi } from '@/features/auth/api/auth.api'
import { authKeys } from '@/features/auth/api/keys'
import { useChangePassword } from '@/features/auth/api/useChangePassword'
import { useAuthStore } from '@/features/auth/auth.store'
import { recordCodeSent, resendAllowedAt } from '@/features/auth/lib/code-sent'
import { formatWait } from '@/features/auth/lib/form-errors'
import { requestFailure, useMessageText, type RequestFailure } from '@/features/auth/lib/form-problem'
import { passwordFieldRule, type PasswordContext, type PasswordRule } from '@/features/auth/lib/password-rules'
import { newPasswordIssue } from '@/features/auth/lib/schemas'
import { useCodeReset, type Limit } from '@/features/auth/hooks/useCodeReset'
import { ResendLine, ResetCodeField, ResetNotice, ResetPasswordField } from './CodeReset'
import { PasswordInput } from './PasswordInput'
import { PasswordRules } from './PasswordRules'

type Mode = { kind: 'password' } | { kind: 'code'; failure: RequestFailure | null }

/**
 * "Change password" on the account page (S-ME-03, REQ-AUTH-05): the button
 * of the Password row and its dialog. Knowing the current password changes
 * it here and signs the other devices out; "Forgot password?" turns the same
 * dialog into the emailed-code way (D-74), which ends every session and
 * starts a new one in this browser (D-62).
 *
 * The dialog cannot be closed while a request runs; closed, it forgets what
 * was typed and opens on the current password again. Done either way, it
 * closes itself.
 */
export function ChangePasswordDialog({ email, username }: { email: string; username?: string | null }) {
    const { t } = useTranslation('auth')
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [mode, setMode] = useState<Mode>({ kind: 'password' })

    function close() {
        setBusy(false)
        setOpen(false)
        setMode({ kind: 'password' })
    }

    return (
        <>
            <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
                {t('settings.changePassword.open')}
            </Button>
            <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : !busy && close())}>
                <DialogContent className='sm:max-w-[520px]'>
                    {mode.kind === 'password' ? (
                        <CurrentPasswordForm
                            identity={{ email, username }}
                            setBusy={setBusy}
                            onDone={close}
                            onForgot={(failure) => setMode({ kind: 'code', failure })}
                        />
                    ) : (
                        <CodeForm
                            email={email}
                            initialFailure={mode.failure}
                            setBusy={setBusy}
                            onBack={() => setMode({ kind: 'password' })}
                            onDone={close}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}

const createSchema = (identity: PasswordContext) =>
    z.object({ currentPassword: z.string(), password: z.string() }).superRefine((values, ctx) => {
        if (!values.currentPassword) {
            ctx.addIssue({ code: 'custom', path: ['currentPassword'], message: 'auth:validation.passwordRequired' })
        }
        const message = newPasswordIssue(values.password, identity)
        if (message) ctx.addIssue({ code: 'custom', path: ['password'], message })
    })

type Values = z.infer<ReturnType<typeof createSchema>>

function CurrentPasswordForm({
    identity,
    setBusy,
    onDone,
    onForgot
}: {
    identity: { email: string; username?: string | null }
    setBusy: (busy: boolean) => void
    onDone: () => void
    onForgot: (failure: RequestFailure | null) => void
}) {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const changePassword = useChangePassword()
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    // Five wrong current passwords in 15 minutes (D-73): the button waits it out.
    const [limit, setLimit] = useState<Limit | null>(null)
    const [sendingCode, setSendingCode] = useState(false)
    const wait = useCountdown(limit?.until)
    const limited = limit !== null && wait > 0

    const [schema] = useState(() => createSchema(identity))
    const {
        register,
        handleSubmit,
        control,
        setError,
        formState: { errors, isSubmitting, isSubmitted }
    } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', password: '' } })
    const password = useWatch({ control, name: 'password' })
    useEffect(() => setBusy(isSubmitting || sendingCode), [isSubmitting, sendingCode, setBusy])
    const fieldError = (message?: string) => (message ? text({ key: message }) : undefined)

    async function change(values: Values) {
        setProblem(null)
        setServerRules([])
        try {
            await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.password })
            toast.success(t('settings.changePassword.done'))
            onDone()
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) setLimit(failure.limit)
            else if (failure.type === 'AUTH_CURRENT_PASSWORD_INVALID') {
                // The new password stays: only the current one was wrong.
                setError('currentPassword', { message: failure.message.key }, { shouldFocus: true })
            } else if (failure.passwordRules.length > 0) {
                setServerRules(failure.passwordRules)
                const fieldRule = passwordFieldRule(failure.passwordRules)
                setError(
                    'password',
                    { message: fieldRule ? `auth:passwordRules.${fieldRule}` : 'auth:validation.passwordWeak' },
                    { shouldFocus: true }
                )
            } else setProblem(failure)
        }
    }

    /**
     * Email a reset code and switch to it (D-74). A code sent under a minute
     * ago is still good: switch without sending another (L11).
     */
    async function forgot() {
        if (resendAllowedAt('password-reset', identity.email)) return onForgot(null)
        setSendingCode(true)
        let failure: RequestFailure | null = null
        try {
            await authApi.forgotPassword(identity.email)
            recordCodeSent('password-reset', identity.email)
        } catch (error) {
            failure = requestFailure(error)
        }
        setSendingCode(false)
        onForgot(failure)
    }

    return (
        <form onSubmit={(event) => void handleSubmit(change)(event)} className='space-y-4' noValidate>
            <DialogHeader>
                <DialogTitle>{t('settings.changePassword.title')}</DialogTitle>
                <DialogDescription>{t('settings.changePassword.description')}</DialogDescription>
            </DialogHeader>
            {/* What a password manager files the new password under. */}
            <input type='email' autoComplete='username' value={identity.email} readOnly hidden />
            <FormField
                label={t('fields.currentPassword')}
                error={fieldError(errors.currentPassword?.message)}
                action={
                    // Styled like "Forgot password?" on the sign-in page (S-AUTH-03).
                    <button
                        type='button'
                        className='font-semibold text-primary hover:underline'
                        disabled={sendingCode || isSubmitting}
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
                        {...register('currentPassword')}
                    />
                )}
            </FormField>
            <div className='space-y-2'>
                <FormField label={t('fields.newPassword')} error={fieldError(errors.password?.message)}>
                    {(field) => (
                        <PasswordInput
                            autoComplete='new-password'
                            readOnly={isSubmitting}
                            {...field}
                            {...register('password', { onChange: () => setServerRules([]) })}
                        />
                    )}
                </FormField>
                <PasswordRules
                    password={password}
                    serverRules={serverRules}
                    showErrors={isSubmitted && Boolean(errors.password)}
                />
            </div>
            {limited ? (
                <FormMessage tone='neutral' icon='clock'>
                    {t('settings.changePassword.tooManyWrong', { wait: formatWait(wait) })}
                </FormMessage>
            ) : problem ? (
                <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
                    {text(problem.message)}
                </FormMessage>
            ) : null}
            <DialogFooter>
                <DialogClose asChild>
                    <Button type='button' variant='text' disabled={isSubmitting || sendingCode}>
                        {t('settings.changePassword.cancel')}
                    </Button>
                </DialogClose>
                <Button type='submit' disabled={isSubmitting || sendingCode || limited}>
                    {isSubmitting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                    {t('settings.changePassword.submit')}
                </Button>
            </DialogFooter>
        </form>
    )
}

function CodeForm({
    email,
    initialFailure,
    setBusy,
    onBack,
    onDone
}: {
    email: string
    initialFailure: RequestFailure | null
    setBusy: (busy: boolean) => void
    onBack: () => void
    onDone: () => void
}) {
    const { t } = useTranslation('auth')
    const queryClient = useQueryClient()
    const startSession = useAuthStore((state) => state.startSession)
    const reset = useCodeReset({
        email,
        initialFailure,
        onReset: async (tokens) => {
            // Every earlier session ended, this one too: take up the new one (D-62).
            await startSession(tokens)
            await queryClient.invalidateQueries({ queryKey: authKeys.sessions() })
            toast.success(t('resetPassword.done'))
            onDone()
        }
    })

    // focusCode never changes: focus the code once, when this mode opens.
    const { focusCode } = reset
    useEffect(focusCode, [focusCode])
    useEffect(() => setBusy(reset.busy || reset.sending), [reset.busy, reset.sending, setBusy])

    return (
        <form onSubmit={reset.onSubmit} className='space-y-4' noValidate>
            <DialogHeader>
                <DialogTitle>{t('settings.changePassword.codeTitle')}</DialogTitle>
                <DialogDescription>{t('settings.changePassword.codeSentTo', { email })}</DialogDescription>
            </DialogHeader>
            {/* What a password manager files the new password under. */}
            <input type='email' autoComplete='username' value={email} readOnly hidden />
            <div className='space-y-2'>
                <ResetCodeField reset={reset} />
                <ResendLine reset={reset} />
            </div>
            <ResetPasswordField reset={reset} />
            <ResetNotice reset={reset} />
            <DialogFooter>
                <Button type='button' variant='text' disabled={reset.busy} onClick={onBack}>
                    {t('settings.changePassword.back')}
                </Button>
                <Button type='submit' disabled={reset.submitDisabled}>
                    {reset.busy ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                    {reset.phase === 'expired' ? t('resetPassword.sendNew') : t('settings.changePassword.codeSubmit')}
                </Button>
            </DialogFooter>
        </form>
    )
}

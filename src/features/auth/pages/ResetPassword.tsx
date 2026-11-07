import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { useCountdown } from '@/hooks/useCountdown'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { afterSignIn, AUTH_PATHS, withFlow } from '@/features/auth/lib/paths'
import { authPageState, useAuthPageState } from '@/features/auth/lib/page-state'
import { recordCodeSent, resendAllowedAt, RESEND_AFTER_SECONDS } from '@/features/auth/lib/code-sent'
import { formatWait, type RateLimitReason } from '@/features/auth/lib/form-errors'
import { requestFailure, useMessageText, type RequestFailure } from '@/features/auth/lib/form-problem'
import { brokenPasswordRules, passwordFieldRule, type PasswordRule } from '@/features/auth/lib/password-rules'
import { AuthCard } from '@/features/auth/components/AuthCard'
import { CODE_LENGTH, CodeInput, type CodeInputState } from '@/features/auth/components/CodeInput'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { PasswordRules } from '@/features/auth/components/PasswordRules'

/** Where the code stands: being typed, wrong, or dead (expired or five wrong tries). */
type Phase = 'entering' | 'wrong' | 'expired'

interface Limit {
    reason?: RateLimitReason
    until: number
}

/** The password's rules (REQ-AUTH-01, D-66): keys, put into words when shown. */
const createSchema = (email: string) =>
    z.object({ password: z.string() }).superRefine(({ password }, ctx) => {
        const broken = brokenPasswordRules(password, { email })
        const fieldRule = passwordFieldRule(broken)
        if (fieldRule) ctx.addIssue({ code: 'custom', path: ['password'], message: `auth:passwordRules.${fieldRule}` })
        else if (broken.length > 0) {
            ctx.addIssue({ code: 'custom', path: ['password'], message: 'auth:validation.passwordWeak' })
        }
    })

type Values = z.infer<ReturnType<typeof createSchema>>

/**
 * Forgot password, step two (S-AUTH-04 `reset-form`): the emailed code and
 * the new password on one page, since the API checks the code and sets the
 * password in one call (D-62). It ends every other session and signs in here.
 *
 * Arrives with the address in the router's state; without one (a new tab, a
 * bookmark) it goes back to step one. The page says the code comes only if
 * the address has an account, the same words for every address (NFR-SEC-05).
 */
export default function ResetPassword() {
    const { email } = useAuthPageState()
    const { search } = useLocation()
    if (!email) return <Navigate to={withFlow(AUTH_PATHS.forgotPassword, search)} replace />
    return <ResetForm email={email} />
}

function ResetForm({ email }: { email: string }) {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const navigate = useNavigate()
    const location = useLocation()
    const startSession = useAuthStore((state) => state.startSession)
    const codeInput = useRef<HTMLInputElement>(null)
    const [code, setCode] = useState('')
    const [phase, setPhase] = useState<Phase>('entering')
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    // Too many wrong codes (from this network, or for this address): nothing can be sent until it lifts.
    const [codeLimit, setCodeLimit] = useState<Limit | null>(null)
    // Too many code emails: "Send again" waits; the code in hand still works.
    const [resendLimit, setResendLimit] = useState<Limit | null>(null)
    const [resendAt, setResendAt] = useState(() => resendAllowedAt('password-reset', email))
    const [sending, setSending] = useState(false)
    const resendIn = useCountdown(resendAt)
    const codeWait = useCountdown(codeLimit?.until)
    const resendWait = useCountdown(resendLimit?.until)
    useDocumentTitle(t('resetPassword.tab'))

    const [schema] = useState(() => createSchema(email))
    const {
        register,
        handleSubmit,
        control,
        setFocus,
        setError,
        formState: { errors, isSubmitting, isSubmitted }
    } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } })
    const password = useWatch({ control, name: 'password' })

    const codeBlocked = codeLimit !== null && codeWait > 0
    const resendBlocked = resendLimit !== null && resendWait > 0

    useEffect(() => {
        codeInput.current?.focus()
    }, [])

    async function reset({ password: newPassword }: Values) {
        setProblem(null)
        setServerRules([])
        try {
            await startSession(await authApi.resetPassword(email, code, newPassword))
            toast.success(t('resetPassword.done'))
            void navigate(afterSignIn({ completed: useAuthStore.getState().isComplete }, location.search), {
                replace: true
            })
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) {
                setCodeLimit(failure.limit)
                setCode('')
                setPhase('entering')
            } else if (failure.type === 'AUTH_CODE_EXPIRED') {
                setPhase('expired')
                setProblem(failure)
            } else if (failure.type === 'AUTH_CODE_INVALID') {
                // The new password stays: only the code was wrong.
                setPhase('wrong')
                setProblem(failure)
                setTimeout(() => codeInput.current?.focus())
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

    async function resend() {
        setSending(true)
        setResendLimit(null)
        try {
            await authApi.forgotPassword(email)
            recordCodeSent('password-reset', email)
            setResendAt(Date.now() + RESEND_AFTER_SECONDS * 1000)
            setCode('')
            setPhase('entering')
            setProblem(null)
            // Hedged like the page: no word on whether the address has an account (NFR-SEC-05).
            toast(t('resetPassword.resent', { email }), { icon: <Mail className='size-4' aria-hidden='true' /> })
            setTimeout(() => codeInput.current?.focus())
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) setResendLimit(failure.limit)
            else setProblem(failure)
        } finally {
            setSending(false)
        }
    }

    function onSubmit(event: FormEvent) {
        event.preventDefault()
        if (phase === 'expired') return void resend()
        if (codeBlocked) return
        if (code.length < CODE_LENGTH) {
            setPhase('wrong')
            setProblem({ passwordRules: [], offline: false, message: { key: 'auth:validation.codeIncomplete' } })
            codeInput.current?.focus()
            return
        }
        void handleSubmit(reset)(event)
    }

    /** Back to step one, the address still there (C-34). */
    function back() {
        if (location.key !== 'default') return void navigate(-1)
        void navigate(withFlow(AUTH_PATHS.forgotPassword, location.search), { state: authPageState(email) })
    }

    const inputState: CodeInputState =
        codeBlocked || phase === 'expired' ? 'disabled' : phase === 'wrong' ? 'error' : 'default'

    const codeLimitKey =
        codeLimit?.reason === 'network'
            ? 'auth:limits.codesNetwork'
            : codeLimit?.reason === 'codes'
              ? 'auth:limits.resetCodesEmail'
              : 'auth:limits.other'
    const resendLimitKey =
        resendLimit?.reason === 'recent_email'
            ? 'auth:limits.resetResendRecent'
            : resendLimit?.reason === 'emails'
              ? 'auth:limits.resetResendEmails'
              : resendLimit?.reason === 'network'
                ? 'auth:limits.resetResendNetwork'
                : 'auth:limits.other'

    const message = codeBlocked ? (
        <FormMessage tone='neutral' icon='clock'>
            {text({ key: codeLimitKey, values: { wait: formatWait(codeWait) } })}
        </FormMessage>
    ) : resendBlocked ? (
        <FormMessage tone='neutral' icon='clock'>
            {text({ key: resendLimitKey, values: { wait: formatWait(resendWait) } })}
        </FormMessage>
    ) : problem ? (
        <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
            {text(problem.message)}
        </FormMessage>
    ) : null

    const busy = isSubmitting || (phase === 'expired' && sending)

    return (
        <div className='space-y-6'>
            <Button type='button' variant='text' size='sm' className='-ml-3' onClick={back}>
                <ArrowLeft aria-hidden='true' />
                {t('resetPassword.back')}
            </Button>
            <AuthCard
                title={t('resetPassword.title')}
                subtitle={<span data-testid='sent-to'>{t('resetPassword.sentTo', { email })}</span>}
            >
                <form onSubmit={onSubmit} className='space-y-4' noValidate>
                    <div className='grid gap-1'>
                        <span className='text-label text-text-secondary' aria-hidden='true'>
                            {t('resetPassword.codeLabel')}
                        </span>
                        <CodeInput
                            ref={codeInput}
                            value={code}
                            onChange={(value) => {
                                setCode(value)
                                if (phase === 'wrong') {
                                    setPhase('entering')
                                    setProblem(null)
                                }
                            }}
                            // Six digits: on to the password; nothing is sent yet (S-AUTH-04).
                            onComplete={() => setFocus('password')}
                            state={inputState}
                            label={t('verify.codeLabel')}
                        />
                    </div>
                    <div className='space-y-2'>
                        <FormField
                            label={t('resetPassword.newPassword')}
                            error={errors.password?.message ? text({ key: errors.password.message }) : undefined}
                        >
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
                    <p className='text-label text-text-tertiary'>{t('resetPassword.signsOut')}</p>
                    {message}
                    <Button
                        type='submit'
                        className='w-full'
                        disabled={busy || codeBlocked || (phase === 'expired' && resendBlocked)}
                    >
                        {busy ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {phase === 'expired' ? t('resetPassword.sendNew') : t('resetPassword.submit')}
                    </Button>
                </form>
                {phase === 'expired' || codeBlocked ? null : (
                    <p className='flex flex-wrap items-center gap-x-1 text-body-sm text-text-secondary'>
                        {t('verify.noCode')}{' '}
                        {resendIn > 0 ? (
                            <span className='font-semibold text-text-tertiary' aria-live='off'>
                                {t('verify.resendIn')} <span className='font-numeric tabular-nums'>{resendIn}</span>{' '}
                                {t('verify.seconds')}
                            </span>
                        ) : (
                            <Button
                                type='button'
                                variant='text'
                                size='sm'
                                className='-mx-3'
                                disabled={resendBlocked || sending}
                                onClick={() => void resend()}
                            >
                                {t('verify.resend')}
                            </Button>
                        )}
                    </p>
                )}
            </AuthCard>
        </div>
    )
}

import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { rememberSignInMethod } from '@/features/auth/lib/sign-in-method'
import { AuthCard } from '@/features/auth/components/AuthCard'
import { CODE_LENGTH, CodeInput, type CodeInputState } from '@/features/auth/components/CodeInput'

/** Where the code stands: being typed, being checked, wrong, or dead (expired or five wrong tries). */
type Phase = 'entering' | 'verifying' | 'wrong' | 'expired'

interface Limit {
    reason?: RateLimitReason
    until: number
}

/** An address that breaks only after `@` or `.` (01-auth.md › AUTH-EDGE long-email). */
function BreakableEmail({ email }: { email: string }) {
    const parts = email.split(/(?<=[@.])/)
    return (
        <>
            {parts.map((part, index) => (
                <Fragment key={index}>
                    {index > 0 ? <wbr /> : null}
                    {part}
                </Fragment>
            ))}
        </>
    )
}

/**
 * Enter the emailed code (S-AUTH-02): one page for creating an account and
 * signing in with a code (D-60). The right code signs in, to the address's
 * account or to one made just now; the page never says which beforehand.
 *
 * Arrives with the address in the router's state, and which page sent it
 * there. Without one (a new tab, a bookmark) it goes to "Create account".
 * The resend countdown runs from when the code really went out, across a
 * reload (code-sent.ts, D-67).
 */
export default function Verify() {
    const { email, from } = useAuthPageState()
    const { search } = useLocation()
    if (!email) return <Navigate to={withFlow(AUTH_PATHS.register, search)} replace />
    return <VerifyCode email={email} from={from ?? 'register'} />
}

function VerifyCode({ email, from }: { email: string; from: 'register' | 'login' }) {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const navigate = useNavigate()
    const location = useLocation()
    const startSession = useAuthStore((state) => state.startSession)
    const input = useRef<HTMLInputElement>(null)
    const [code, setCode] = useState('')
    const [phase, setPhase] = useState<Phase>('entering')
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    // Too many wrong codes (from this network, or for this address): nothing can be typed until it lifts.
    const [codeLimit, setCodeLimit] = useState<Limit | null>(null)
    // Too many code emails: "Send again" waits; the code in hand still works.
    const [resendLimit, setResendLimit] = useState<Limit | null>(null)
    const [resendAt, setResendAt] = useState(() => resendAllowedAt('sign-in', email))
    const [sending, setSending] = useState(false)
    const resendIn = useCountdown(resendAt)
    const codeWait = useCountdown(codeLimit?.until)
    const resendWait = useCountdown(resendLimit?.until)
    useDocumentTitle(t('verify.tab'))

    const codeBlocked = codeLimit !== null && codeWait > 0
    const resendBlocked = resendLimit !== null && resendWait > 0

    useEffect(() => {
        input.current?.focus()
    }, [])

    async function verify(value: string) {
        if (phase === 'verifying' || codeBlocked) return
        if (value.length < CODE_LENGTH) {
            setPhase('wrong')
            setProblem({ passwordRules: [], offline: false, message: { key: 'auth:validation.codeIncomplete' } })
            input.current?.focus()
            return
        }
        setPhase('verifying')
        setProblem(null)
        try {
            const { account, ...tokens } = await authApi.verifyEmailCode(email, value)
            await startSession(tokens, account)
            // Signing in by code: the sign-in page opens on the code next time (D-68).
            rememberSignInMethod('code')
            // Came to create an account, and the address had one: say so (01-auth.md › Điều hướng).
            if (from === 'register' && !account.created) toast(t('verify.existingAccount'))
            // Waiting to be deleted: the sign-in page, on the code, under the restore dialog.
            const pendingDeletion = useAuthStore.getState().deletesAt !== null
            void navigate(afterSignIn({ ...account, pendingDeletion }, location.search), {
                replace: true,
                state: authPageState(email)
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
                setPhase('wrong')
                setProblem(failure)
                // A tick later: the field is read-only until the phase changes.
                setTimeout(() => input.current?.focus())
            } else {
                // Offline, or the server failed: the code is kept, to send again.
                setPhase('entering')
                setProblem(failure)
            }
        }
    }

    async function resend() {
        setSending(true)
        setResendLimit(null)
        try {
            await authApi.sendEmailCode(email)
            recordCodeSent('sign-in', email)
            setResendAt(Date.now() + RESEND_AFTER_SECONDS * 1000)
            setCode('')
            setPhase('entering')
            setProblem(null)
            toast(t('verify.resent', { email }), { icon: <Mail className='size-4' aria-hidden='true' /> })
            setTimeout(() => input.current?.focus())
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
        if (phase === 'expired') void resend()
        else void verify(code)
    }

    /** Back where the address was typed, with it still there: the same as the browser's back button. */
    function back() {
        if (location.key !== 'default') return void navigate(-1)
        void navigate(withFlow(from === 'login' ? AUTH_PATHS.signIn : AUTH_PATHS.register, location.search), {
            state: authPageState(email)
        })
    }

    function signInWithPassword() {
        const target = new URL(withFlow(AUTH_PATHS.signIn, location.search), window.location.origin)
        target.searchParams.set('method', 'password')
        void navigate(`${target.pathname}${target.search}`, { state: authPageState(email) })
    }

    const inputState: CodeInputState =
        codeBlocked || phase === 'expired'
            ? 'disabled'
            : phase === 'verifying'
              ? 'verifying'
              : phase === 'wrong'
                ? 'error'
                : 'default'

    const codeLimitKey =
        codeLimit?.reason === 'network'
            ? 'auth:limits.codesNetwork'
            : codeLimit?.reason === 'codes'
              ? 'auth:limits.codesEmail'
              : 'auth:limits.other'
    const resendLimitKey =
        resendLimit?.reason === 'recent_email'
            ? 'auth:limits.resendRecent'
            : resendLimit?.reason === 'emails'
              ? 'auth:limits.resendEmails'
              : resendLimit?.reason === 'network'
                ? 'auth:limits.resendNetwork'
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

    return (
        <div className='space-y-6'>
            <Button type='button' variant='text' size='sm' className='-ml-3' onClick={back}>
                <ArrowLeft aria-hidden='true' />
                {t('verify.back')}
            </Button>
            <AuthCard
                title={t('verify.title')}
                subtitle={
                    <>
                        {t('verify.sentTo')}
                        <br />
                        <span className='font-semibold text-text-primary' data-testid='sent-to'>
                            <BreakableEmail email={email} />
                        </span>
                    </>
                }
            >
                <form onSubmit={onSubmit} className='space-y-4' noValidate>
                    <CodeInput
                        ref={input}
                        value={code}
                        onChange={(value) => {
                            setCode(value)
                            if (phase === 'wrong') {
                                setPhase('entering')
                                setProblem(null)
                            }
                        }}
                        onComplete={(value) => void verify(value)}
                        state={inputState}
                        label={t('verify.codeLabel')}
                    />
                    {message}
                    <Button
                        type='submit'
                        className='w-full'
                        disabled={
                            phase === 'verifying' || codeBlocked || (phase === 'expired' && (resendBlocked || sending))
                        }
                    >
                        {phase === 'verifying' || (phase === 'expired' && sending) ? (
                            <Loader2 className='animate-spin' aria-hidden='true' />
                        ) : null}
                        {phase === 'expired' ? t('verify.sendNew') : t('verify.submit')}
                    </Button>
                </form>
                <div className='space-y-3 text-body-sm text-text-secondary'>
                    <p className='text-label text-text-tertiary'>{t('verify.validity')}</p>
                    {phase === 'expired' || codeBlocked ? null : (
                        <p className='flex flex-wrap items-center gap-x-1'>
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
                    <Button type='button' variant='text' size='sm' className='-ml-3' onClick={signInWithPassword}>
                        {t('verify.withPassword')}
                    </Button>
                </div>
            </AuthCard>
        </div>
    )
}

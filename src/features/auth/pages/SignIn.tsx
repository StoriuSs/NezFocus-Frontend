import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import { Loader2, LogOut, ShieldAlert } from 'lucide-react'
import { Banner } from '@/components/Banner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { useCountdown } from '@/hooks/useCountdown'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { afterSignIn, AUTH_PATHS, withFlow } from '@/features/auth/lib/paths'
import { authPageState, useAuthPageState } from '@/features/auth/lib/page-state'
import { recordCodeSent, resendAllowedAt } from '@/features/auth/lib/code-sent'
import { formatWait, type RateLimitReason } from '@/features/auth/lib/form-errors'
import { requestFailure, useMessageText, type RequestFailure } from '@/features/auth/lib/form-problem'
import {
    METHOD_PARAM,
    rememberedSignInMethod,
    rememberSignInMethod,
    signInMethodOf,
    type SignInMethod
} from '@/features/auth/lib/sign-in-method'
import { isSessionEnded, sessionEndedOf } from '@/features/auth/lib/sign-out-notice'
import { AuthCard } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { OAuthButtons } from '@/features/auth/components/OAuthButtons'

interface Values {
    email: string
    password: string
}

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Messages are keys, put into words when shown (form-problem.ts). Only the way on screen is checked. */
function createSchema(method: SignInMethod) {
    return z.object({ email: z.string(), password: z.string() }).superRefine((values, ctx) => {
        const issue = (path: keyof Values, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
        const email = values.email.trim()
        const byCode = method === 'code'
        if (!email) issue('email', byCode ? 'auth:validation.emailRequiredForCode' : 'auth:validation.emailRequired')
        else if (!z.email().safeParse(email).success) issue('email', 'auth:validation.emailFormat')
        if (!byCode && !values.password) issue('password', 'auth:validation.passwordRequired')
    })
}

/** A limit that refused, and the address it was for: one on the address lifts for another address. */
interface Limit {
    reason?: RateLimitReason
    until: number
    email: string
}

/** The words for a limit, by the way it refused (01-auth.md › S-AUTH-03 `rate-limited`, `password-rate-limited`). */
function limitKey(method: SignInMethod, reason: RateLimitReason | undefined): string {
    if (reason === 'network') return method === 'code' ? 'auth:limits.signInNetwork' : 'auth:limits.passwordNetwork'
    if (method === 'code' && reason === 'recent_email') return 'auth:limits.signInRecent'
    if (method === 'code' && reason === 'emails') return 'auth:limits.signInEmails'
    if (method === 'password' && reason === 'sign_ins') return 'auth:limits.passwordTries'
    return 'auth:limits.other'
}

/**
 * Sign in (S-AUTH-03): by a one-time code sent to the email, the default, or
 * by password (`?method=password`). Each way leads into the other, keeping
 * the address typed. The browser remembers the way of the last sign-in that
 * worked and opens on it (D-68).
 *
 * The code way is "create account" in other words: the same code, the same
 * next page (S-AUTH-02), and it never says whether the address has an
 * account (D-60). A session that ended by itself or elsewhere lands here,
 * with a banner saying why (D-65).
 */
export default function SignIn() {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const navigate = useNavigate()
    const { pathname, search } = useLocation()
    const [params] = useSearchParams()
    const handedOver = useAuthPageState()
    const signIn = useAuthStore((state) => state.signIn)
    const takeSignOutReason = useAuthStore((state) => state.takeSignOutReason)
    // Read while rendering, taken once shown: a reload does not say it again.
    const [ended] = useState(() => sessionEndedOf(useAuthStore.getState().peekSignOutReason()))
    // A password changed elsewhere: the new password is the way back in.
    const method: SignInMethod =
        !params.has(METHOD_PARAM) && ended === 'password-changed' ? 'password' : signInMethodOf(params)
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    const [limit, setLimit] = useState<Limit | null>(null)
    const wait = useCountdown(limit?.until)
    useDocumentTitle(t('signIn.tab'))

    const {
        register,
        handleSubmit,
        control,
        getValues,
        setFocus,
        setValue,
        clearErrors,
        formState: { errors, isSubmitting }
    } = useForm<Values, SignInMethod>({
        // The way on screen, passed at each check: useForm takes its options afresh on every render.
        context: method,
        resolver: (values, way, options) => zodResolver(createSchema(way ?? 'code'))(values, way, options),
        defaultValues: { email: handedOver.email ?? '', password: '' }
    })
    const email = useWatch({ control, name: 'email' })

    useEffect(() => {
        if (ended) takeSignOutReason(isSessionEnded)
    }, [ended, takeSignOutReason])

    // The first empty field of the way on screen (S-AUTH-03 › Tương tác).
    useEffect(() => {
        setFocus(method === 'password' && getValues('email').trim() ? 'password' : 'email')
    }, [method, getValues, setFocus])

    // A limit on this address lifts for another address; the network's does not.
    const limited = limit !== null && wait > 0 && (limit.reason === 'network' || sameAddress(limit.email, email))

    function switchTo(next: SignInMethod) {
        const query = new URLSearchParams(search)
        if (next === 'password') query.set(METHOD_PARAM, 'password')
        // Named only when the browser would open the other way on a reload.
        else if (rememberedSignInMethod() === 'password') query.set(METHOD_PARAM, 'code')
        else query.delete(METHOD_PARAM)
        setProblem(null)
        setLimit(null)
        clearErrors()
        const kept = getValues('email').trim()
        void navigate(`${pathname}${query.size ? `?${query}` : ''}`, {
            replace: true,
            state: authPageState(kept || undefined)
        })
    }

    async function sendCode(address: string) {
        const next = withFlow(AUTH_PATHS.verify, search)
        const state = authPageState(address, { from: 'login' })
        // Keep the address on this page's history entry: "Back" on the code
        // page, or the browser's back button, finds it filled in.
        void navigate(`${pathname}${search}`, { replace: true, state: authPageState(address) })
        // The same address within the minute: the code already sent still works (D-67).
        if (resendAllowedAt('sign-in', address)) return void navigate(next, { state })
        try {
            await authApi.sendEmailCode(address)
            recordCodeSent('sign-in', address)
            void navigate(next, { state })
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) setLimit({ ...failure.limit, email: address })
            else setProblem(failure)
        }
    }

    async function signInWithPassword(address: string, password: string) {
        try {
            await signIn(address, password)
            rememberSignInMethod('password')
            void navigate(afterSignIn({ completed: useAuthStore.getState().isComplete }, params), { replace: true })
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) return setLimit({ ...failure.limit, email: address })
            // The same words for a wrong password, an unknown address and an
            // account without a password (D-60); the password is typed again.
            if (failure.type === 'AUTH_INVALID_CREDENTIALS') {
                setValue('password', '')
                setTimeout(() => setFocus('password'))
            }
            setProblem(failure)
        }
    }

    async function onSubmit(values: Values) {
        setProblem(null)
        const address = values.email.trim()
        if (method === 'code') await sendCode(address)
        else await signInWithPassword(address, values.password)
    }

    const fieldError = (message: string | undefined) => (message ? text({ key: message }) : undefined)
    const banner = ended ? (
        <Banner icon={ended === 'security' ? ShieldAlert : LogOut}>{t(`sessionEnded.${ended}`)}</Banner>
    ) : null

    return (
        <div className='space-y-6'>
            {banner}
            <AuthCard
                title={t('signIn.title')}
                subtitle={method === 'code' ? t('signIn.subtitle') : null}
                footer={
                    <p>
                        {t('signIn.noAccount')}{' '}
                        <Link
                            to={withFlow(AUTH_PATHS.register, search)}
                            state={authPageState(email.trim() || undefined)}
                            className='font-semibold text-primary hover:underline'
                        >
                            {t('signIn.createAccount')}
                        </Link>
                    </p>
                }
            >
                <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                    <FormField label={t('fields.email')} error={fieldError(errors.email?.message)}>
                        {(field) => (
                            <Input
                                type='email'
                                autoComplete={method === 'password' ? 'username' : 'email'}
                                placeholder={method === 'code' ? t('signIn.emailPlaceholder') : undefined}
                                readOnly={isSubmitting}
                                {...field}
                                {...register('email')}
                            />
                        )}
                    </FormField>
                    {method === 'password' ? (
                        <FormField
                            label={t('fields.password')}
                            error={fieldError(errors.password?.message)}
                            action={
                                <Link
                                    to={withFlow(AUTH_PATHS.forgotPassword, search)}
                                    state={authPageState(email.trim() || undefined)}
                                    className='font-semibold text-primary hover:underline'
                                >
                                    {t('signIn.forgot')}
                                </Link>
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
                    ) : null}
                    {limited ? (
                        <FormMessage tone='neutral' icon='clock'>
                            {text({ key: limitKey(method, limit.reason), values: { wait: formatWait(wait) } })}
                        </FormMessage>
                    ) : problem ? (
                        <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
                            {text(problem.message)}
                        </FormMessage>
                    ) : null}
                    <Button type='submit' className='w-full' disabled={isSubmitting || limited}>
                        {isSubmitting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {method === 'code' ? t('signIn.sendCode') : t('signIn.submit')}
                    </Button>
                </form>
                <OAuthButtons next={params.get('next')} disabled={isSubmitting}>
                    <Button
                        type='button'
                        variant='outline'
                        className='w-full'
                        disabled={isSubmitting}
                        onClick={() => switchTo(method === 'code' ? 'password' : 'code')}
                    >
                        {method === 'code' ? t('signIn.withPassword') : t('signIn.withCode')}
                    </Button>
                </OAuthButtons>
            </AuthCard>
        </div>
    )
}

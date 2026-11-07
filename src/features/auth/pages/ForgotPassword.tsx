import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { FormMessage } from '@/components/form/FormMessage'
import { useCountdown } from '@/hooks/useCountdown'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { authApi } from '@/features/auth/api/auth.api'
import { AUTH_PATHS, withFlow } from '@/features/auth/lib/paths'
import { authPageState, useAuthPageState } from '@/features/auth/lib/page-state'
import { recordCodeSent, resendAllowedAt } from '@/features/auth/lib/code-sent'
import { formatWait, type RateLimitReason } from '@/features/auth/lib/form-errors'
import { requestFailure, useMessageText, type RequestFailure } from '@/features/auth/lib/form-problem'
import { METHOD_PARAM } from '@/features/auth/lib/sign-in-method'
import { AuthCard } from '@/features/auth/components/AuthCard'

/** Messages are keys, put into words when shown (form-problem.ts). */
const emailSchema = z.object({
    email: z.string().trim().min(1, 'auth:validation.emailRequired').pipe(z.email('auth:validation.emailFormat'))
})

type Values = z.input<typeof emailSchema>

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Forgot password, step one (S-AUTH-04 `request`): the address to send a
 * reset code to. The API answers the same whether or not it has an account,
 * so this page always moves on to the code and the new password, and never
 * says which (NFR-SEC-05). The reset code is its own kind: a sign-in code
 * does not work here, nor this one there (D-60).
 */
export default function ForgotPassword() {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const navigate = useNavigate()
    const { pathname, search } = useLocation()
    const handedOver = useAuthPageState()
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    const [limit, setLimit] = useState<{ reason?: RateLimitReason; until: number; email: string } | null>(null)
    const wait = useCountdown(limit?.until)
    useDocumentTitle(t('forgotPassword.tab'))

    const {
        register,
        handleSubmit,
        control,
        setFocus,
        formState: { errors, isSubmitting }
    } = useForm<Values>({ resolver: zodResolver(emailSchema), defaultValues: { email: handedOver.email ?? '' } })
    const email = useWatch({ control, name: 'email' })

    useEffect(() => {
        setFocus('email')
    }, [setFocus])

    // A limit on this address lifts for another address; the network's does not.
    const limited = limit !== null && wait > 0 && (limit.reason === 'network' || sameAddress(limit.email, email))

    /** Back to sign in by password, the address still there. */
    function back() {
        const target = new URL(withFlow(AUTH_PATHS.signIn, search), window.location.origin)
        target.searchParams.set(METHOD_PARAM, 'password')
        void navigate(`${target.pathname}${target.search}`, { state: authPageState(email.trim() || undefined) })
    }

    async function onSubmit(values: Values) {
        setProblem(null)
        const address = values.email.trim()
        const next = withFlow(AUTH_PATHS.resetPassword, search)
        const state = authPageState(address)
        // "Back" on the next page, or the browser's, finds the address here.
        void navigate(`${pathname}${search}`, { replace: true, state })
        // The same address within the minute: the code already sent still works (D-67).
        if (resendAllowedAt('password-reset', address)) return void navigate(next, { state })
        try {
            await authApi.forgotPassword(address)
            recordCodeSent('password-reset', address)
            void navigate(next, { state })
        } catch (error) {
            const failure = requestFailure(error)
            if (failure.limit) setLimit({ ...failure.limit, email: address })
            else setProblem(failure)
        }
    }

    const limitKey =
        limit?.reason === 'recent_email'
            ? 'auth:limits.registerRecent'
            : limit?.reason === 'emails'
              ? 'auth:limits.registerEmails'
              : limit?.reason === 'network'
                ? 'auth:limits.registerNetwork'
                : 'auth:limits.other'

    return (
        <div className='space-y-6'>
            <Button type='button' variant='text' size='sm' className='-ml-3' onClick={back}>
                <ArrowLeft aria-hidden='true' />
                {t('forgotPassword.back')}
            </Button>
            <AuthCard title={t('forgotPassword.title')} subtitle={t('forgotPassword.subtitle')}>
                <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                    <FormField
                        label={t('fields.email')}
                        error={errors.email?.message ? text({ key: errors.email.message }) : undefined}
                    >
                        {(field) => (
                            <Input
                                type='email'
                                autoComplete='email'
                                readOnly={isSubmitting}
                                {...field}
                                {...register('email')}
                            />
                        )}
                    </FormField>
                    {limited ? (
                        <FormMessage tone='neutral' icon='clock'>
                            {text({ key: limitKey, values: { wait: formatWait(wait) } })}
                        </FormMessage>
                    ) : problem ? (
                        <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
                            {text(problem.message)}
                        </FormMessage>
                    ) : null}
                    <Button type='submit' className='w-full' disabled={isSubmitting || limited}>
                        {isSubmitting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('forgotPassword.submit')}
                    </Button>
                </form>
            </AuthCard>
        </div>
    )
}

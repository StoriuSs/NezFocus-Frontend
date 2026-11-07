import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
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
import { AuthCard } from '@/features/auth/components/AuthCard'
import { OAuthButtons } from '@/features/auth/components/OAuthButtons'

/** Messages are keys, put into words when shown (form-problem.ts). */
const emailSchema = z.object({
    email: z.string().trim().min(1, 'auth:validation.emailRequired').pipe(z.email('auth:validation.emailFormat'))
})

type Values = z.input<typeof emailSchema>

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Create an account, step one (S-AUTH-01, D-59): only the email, to send a
 * sign-in code to. The API answers the same whether the address already has
 * an account or not, so this page always moves on to "enter the code" and
 * never says which (NFR-SEC-05). The rest of the account is asked for after
 * the code, on "complete your account" (D-61).
 */
export default function Register() {
    const { t } = useTranslation('auth')
    const text = useMessageText()
    const navigate = useNavigate()
    const { pathname, search } = useLocation()
    const [params] = useSearchParams()
    const handedOver = useAuthPageState()
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    // A limit refused: the button waits it out (D-67).
    const [limit, setLimit] = useState<{ reason?: RateLimitReason; until: number; email: string } | null>(null)
    const wait = useCountdown(limit?.until)
    useDocumentTitle(t('register.tab'))

    const {
        register,
        handleSubmit,
        control,
        setFocus,
        formState: { errors, isSubmitting }
    } = useForm<Values>({
        resolver: zodResolver(emailSchema),
        // Filled in when "Back" on the code page returns here.
        defaultValues: { email: handedOver.email ?? '' }
    })
    const email = useWatch({ control, name: 'email' })

    useEffect(() => {
        setFocus('email')
    }, [setFocus])

    // A limit on this address lifts for another address; the network's does not.
    const limited = limit !== null && wait > 0 && (limit.reason === 'network' || sameAddress(limit.email, email))

    async function onSubmit(values: Values) {
        setProblem(null)
        const address = values.email.trim()
        const next = withFlow(AUTH_PATHS.verify, search)
        const state = authPageState(address, { from: 'register' })
        // Keep the address on this page's history entry: "Back", or the
        // browser's back button, finds it filled in.
        void navigate(`${pathname}${search}`, { replace: true, state: authPageState(address) })

        // The same address within the minute: the code already sent still
        // works, so no new email; the countdown goes on (D-67).
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

    const limitKey =
        limit?.reason === 'recent_email'
            ? 'auth:limits.registerRecent'
            : limit?.reason === 'emails'
              ? 'auth:limits.registerEmails'
              : limit?.reason === 'network'
                ? 'auth:limits.registerNetwork'
                : 'auth:limits.other'

    return (
        <AuthCard
            title={t('register.title')}
            subtitle={t('register.subtitle')}
            footer={
                <p>
                    {t('register.haveAccount')}{' '}
                    <Link
                        to={withFlow(AUTH_PATHS.signIn, search)}
                        state={authPageState(email.trim() || undefined)}
                        className='font-semibold text-primary hover:underline'
                    >
                        {t('register.signIn')}
                    </Link>
                </p>
            }
        >
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                <FormField
                    label={t('fields.email')}
                    error={errors.email?.message ? text({ key: errors.email.message }) : undefined}
                >
                    {(field) => (
                        <Input
                            type='email'
                            autoComplete='email'
                            placeholder={t('register.emailPlaceholder')}
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
                    {t('register.submit')}
                </Button>
            </form>
            <OAuthButtons next={params.get('next')} />
        </AuthCard>
    )
}

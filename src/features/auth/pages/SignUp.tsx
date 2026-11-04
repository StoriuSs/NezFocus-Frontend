import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { authApi } from '@/features/auth/api/auth.api'
import { AUTH_PATHS, withRedirect } from '@/features/auth/lib/paths'
import { authPageState, useAuthPageState } from '@/features/auth/lib/page-state'
import { authFormError, formatWait } from '@/features/auth/lib/form-errors'
import { authFields, newPasswordCheck } from '@/features/auth/lib/schemas'
import type { PasswordRule } from '@/features/auth/lib/password-rules'
import { useTurnstile } from '@/features/auth/hooks/useTurnstile'
import { recordCodeSent } from '@/features/auth/lib/code-sent'
import { holdSignUpPassword } from '@/features/auth/lib/sign-up-password'
import { useResendCooldown } from '@/features/auth/hooks/useResendCooldown'
import { AuthCard, Notice } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { OAuthButtons } from '@/features/auth/components/OAuthButtons'
import { PasswordChecklist } from '@/features/auth/components/PasswordChecklist'

const createSchema = (t: TFunction<'auth'>) =>
    z
        .object({ email: authFields(t).email, password: z.string(), confirmPassword: z.string() })
        .superRefine((values, ctx) => newPasswordCheck(t, values, values.email, ctx))

type Values = z.infer<ReturnType<typeof createSchema>>

/**
 * Create an account. The API answers the same whatever the address — new,
 * taken or unconfirmed — so this page always moves on to "enter the code":
 * it cannot, and must not, say that an address already has an account. The
 * owner of a taken address finds out from their inbox instead: the API emails
 * them how to sign in.
 */
export default function SignUp() {
    const { t } = useTranslation('auth')
    const navigate = useNavigate()
    // Where the visitor was heading: passed along, to go there once signed in.
    const [params] = useSearchParams()
    const redirect = params.get('redirect')
    const handedOver = useAuthPageState()
    const [formError, setFormError] = useState<string | null>(null)
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    const captcha = useTurnstile(true, { offerGoogle: true })
    // After a 429: the button waits as long as the API asked, and says so.
    const wait = useResendCooldown(0)
    const schema = useMemo(() => createSchema(t), [t])
    const {
        register,
        handleSubmit,
        control: formControl,
        formState: { errors, isSubmitting }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        // Filled in when the confirm page sends someone back to use another address.
        defaultValues: { email: handedOver.email ?? '', password: '', confirmPassword: '' }
    })

    const password = useWatch({ control: formControl, name: 'password' })
    const email = useWatch({ control: formControl, name: 'email' })

    async function onSubmit(values: Values) {
        setFormError(null)
        setServerRules([])
        if (captcha.active && !captcha.token) {
            setFormError(captcha.notReadyMessage)
            return
        }
        try {
            await authApi.register(values.email, values.password, captcha.token ?? undefined)
            recordCodeSent('email-verify', values.email)
            // The confirm page sends it with the code (sign-up-password.ts).
            holdSignUpPassword(values.email, values.password)
            void navigate(withRedirect(AUTH_PATHS.verifyEmail, redirect), {
                state: authPageState(values.email, 'code-sent')
            })
        } catch (error) {
            const failure = authFormError(error)
            if (failure.passwordRules.length > 0) {
                // The API checks the password before Turnstile: the token is still good.
                setServerRules(failure.passwordRules)
                return
            }
            if (failure.captchaRequired && !captcha.active) captcha.refresh()
            // A limit refuses before Turnstile is asked: the token is still good.
            if (failure.retryAfterSeconds) wait.start(failure.retryAfterSeconds)
            else captcha.reset()
            setFormError(failure.message)
        }
    }

    return (
        <AuthCard
            title={t('signUp.title')}
            subtitle={t('signUp.subtitle')}
            notice={formError ? <Notice tone='error'>{formError}</Notice> : null}
            footer={
                <p>
                    {t('signUp.haveAccount')}{' '}
                    <Link
                        to={withRedirect(AUTH_PATHS.signIn, redirect)}
                        className='font-medium text-primary hover:underline'
                    >
                        {t('signUp.signIn')}
                    </Link>
                </p>
            }
        >
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                <FormField label={t('fields.email')} error={errors.email?.message}>
                    {(control) => <Input type='email' autoComplete='email' {...control} {...register('email')} />}
                </FormField>
                <div className='space-y-2'>
                    <FormField label={t('fields.password')} error={errors.password?.message}>
                        {(control) => (
                            <PasswordInput
                                autoComplete='new-password'
                                {...control}
                                {...register('password', { onChange: () => setServerRules([]) })}
                            />
                        )}
                    </FormField>
                    <PasswordChecklist password={password} email={email} serverRules={serverRules} />
                </div>
                <FormField label={t('fields.confirmPassword')} error={errors.confirmPassword?.message}>
                    {(control) => (
                        <PasswordInput autoComplete='new-password' {...control} {...register('confirmPassword')} />
                    )}
                </FormField>
                {captcha.widget}
                <Button type='submit' className='w-full' disabled={isSubmitting || wait.remaining > 0}>
                    {isSubmitting
                        ? t('signUp.submitting')
                        : wait.remaining > 0
                          ? t('signUp.submitIn', { wait: formatWait(wait.remaining) })
                          : t('signUp.submit')}
                </Button>
            </form>
            <OAuthButtons redirect={redirect} />
        </AuthCard>
    )
}

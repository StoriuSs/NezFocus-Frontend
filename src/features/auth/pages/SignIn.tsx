import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { useAuthStore } from '@/features/auth/auth.store'
import { AUTH_PATHS, safeRedirect, twoStepPath, withRedirect } from '@/features/auth/lib/paths'
import { authPageState, twoStepState, useAuthPageState } from '@/features/auth/lib/page-state'
import { holdSignUpPassword } from '@/features/auth/lib/sign-up-password'
import { authFormError } from '@/features/auth/lib/form-errors'
import { useTurnstile } from '@/features/auth/hooks/useTurnstile'
import { useAuthOptions } from '@/features/auth/api/useAuthOptions'
import { AuthCard, Notice } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { OAuthButtons } from '@/features/auth/components/OAuthButtons'

const createSchema = (t: TFunction<'auth'>) =>
    z.object({
        email: z.email(t('validation.emailInvalid')),
        password: z.string().min(1, t('validation.passwordRequired'))
    })

type Values = z.infer<ReturnType<typeof createSchema>>

/**
 * Sign in with an address and a password. `?redirect=` is where to go
 * afterwards (a page on this site only). A page that sends someone here may
 * hand over the address to fill in (page-state.ts).
 *
 * After a few failures the API asks for Turnstile as well: the widget appears
 * then, not before, so most people never see it.
 */
export default function SignIn() {
    const { t } = useTranslation('auth')
    const [params] = useSearchParams()
    const handedOver = useAuthPageState()
    const navigate = useNavigate()
    const signIn = useAuthStore((state) => state.signIn)
    const [formError, setFormError] = useState<string | null>(null)
    // After "incorrect email or password", when Google sign-in is on: the
    // account may be one made with Google, which has no password. Shown to
    // everyone, so it says nothing about which accounts those are.
    const [googleHint, setGoogleHint] = useState(false)
    const { providers } = useAuthOptions()
    const [captchaNeeded, setCaptchaNeeded] = useState(false)
    const captcha = useTurnstile(captchaNeeded, { offerGoogle: true })
    const schema = useMemo(() => createSchema(t), [t])
    const {
        register,
        handleSubmit,
        getValues,
        formState: { errors, isSubmitting }
    } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: handedOver.email ?? '' } })

    async function onSubmit({ email, password }: Values) {
        setFormError(null)
        setGoogleHint(false)
        if (captcha.active && !captcha.token) {
            setFormError(captcha.notReadyMessage)
            return
        }
        try {
            await signIn(email, password, captcha.token ?? undefined)
            void navigate(safeRedirect(params.get('redirect')), { replace: true })
        } catch (error) {
            const failure = authFormError(error)
            if (failure.challenge) {
                void navigate(twoStepPath(params.get('redirect')), { state: twoStepState(failure.challenge) })
                return
            }
            // The password was right: the address only needs confirming.
            if (failure.type === 'AUTH_EMAIL_NOT_VERIFIED') {
                // Right, so the confirm page can send it with the code.
                holdSignUpPassword(email, password)
                void navigate(withRedirect(AUTH_PATHS.verifyEmail, params.get('redirect')), {
                    state: authPageState(email, 'unverified')
                })
                return
            }
            if (failure.captchaRequired) {
                if (!captcha.active) captcha.refresh()
                setCaptchaNeeded(true)
            }
            // The token was spent on this attempt, whatever the answer.
            if (captcha.active) captcha.reset()
            setGoogleHint(failure.type === 'AUTH_INVALID_CREDENTIALS')
            setFormError(failure.type === 'AUTH_INVALID_CREDENTIALS' ? t('signIn.wrongCredentials') : failure.message)
        }
    }

    return (
        <AuthCard
            title={t('signIn.title')}
            subtitle={t('signIn.subtitle')}
            notice={
                formError ? (
                    <Notice tone='error'>
                        {formError}
                        {googleHint && providers.includes('google') ? (
                            <span className='mt-1 block'>{t('signIn.googleHint')}</span>
                        ) : null}
                    </Notice>
                ) : null
            }
            footer={
                <p>
                    {t('signIn.noAccount')}{' '}
                    <Link
                        to={withRedirect(AUTH_PATHS.signUp, params.get('redirect'))}
                        className='font-medium text-primary hover:underline'
                    >
                        {t('signIn.createAccount')}
                    </Link>
                </p>
            }
        >
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                <FormField label={t('fields.email')} error={errors.email?.message}>
                    {(control) => <Input type='email' autoComplete='email' {...control} {...register('email')} />}
                </FormField>
                <FormField label={t('fields.password')} error={errors.password?.message}>
                    {(control) => (
                        <PasswordInput autoComplete='current-password' {...control} {...register('password')} />
                    )}
                </FormField>
                <div className='flex justify-end'>
                    <Link
                        to={withRedirect(AUTH_PATHS.forgotPassword, params.get('redirect'))}
                        onClick={(event) => {
                            // Carry the address typed so far to the next page.
                            event.preventDefault()
                            void navigate(withRedirect(AUTH_PATHS.forgotPassword, params.get('redirect')), {
                                state: authPageState(getValues('email') || undefined)
                            })
                        }}
                        className='text-sm text-primary hover:underline'
                    >
                        {t('signIn.forgot')}
                    </Link>
                </div>
                {captcha.widget}
                <Button type='submit' className='w-full' disabled={isSubmitting}>
                    {isSubmitting ? t('signIn.submitting') : t('signIn.submit')}
                </Button>
            </form>
            <OAuthButtons redirect={params.get('redirect')} />
        </AuthCard>
    )
}

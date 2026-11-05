import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuthStore } from '@/features/auth/auth.store'
import { AUTH_PATHS, safeRedirect, withRedirect } from '@/features/auth/lib/paths'
import { authPageState, useAuthPageState } from '@/features/auth/lib/page-state'
import { authFormError } from '@/features/auth/lib/form-errors'
import { authFields, newPasswordCheck } from '@/features/auth/lib/schemas'
import type { PasswordRule } from '@/features/auth/lib/password-rules'
import { AuthCard, Notice } from '@/features/auth/components/AuthCard'
import { PasswordInput } from '@/features/auth/components/PasswordInput'
import { PasswordChecklist } from '@/features/auth/components/PasswordChecklist'
import { SentTo } from '@/features/auth/components/SentTo'
import { useResendCooldown } from '@/features/auth/hooks/useResendCooldown'
import { secondsUntilResend } from '@/features/auth/lib/code-sent'

const createSchema = (t: TFunction<'auth'>) =>
    z
        .object({
            email: authFields(t).email,
            code: authFields(t).code,
            password: z.string(),
            confirmPassword: z.string()
        })
        .superRefine((values, ctx) => newPasswordCheck(t, values, values.email, ctx))

type Values = z.input<ReturnType<typeof createSchema>>

/**
 * Choose a new password with the code from "forgot password". The API ends
 * every earlier session and signs in here.
 *
 * As on the confirm page, the address it arrived with is shown, not editable;
 * opened without one, the page asks for it.
 */
export default function ResetPassword() {
    const { t } = useTranslation('auth')
    const handedOver = useAuthPageState()
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const redirect = params.get('redirect')
    const startSession = useAuthStore((state) => state.startSession)
    const [formError, setFormError] = useState<string | null>(null)
    const [serverRules, setServerRules] = useState<PasswordRule[]>([])
    const schema = useMemo(() => createSchema(t), [t])
    const lockedEmail = z.email().safeParse(handedOver.email).success ? handedOver.email : undefined
    // "Send another code" waits out the minute since the last one, as the API would.
    const resendWait = useResendCooldown(secondsUntilResend('password-reset', lockedEmail))
    const {
        register,
        handleSubmit,
        control: formControl,
        setFocus,
        formState: { errors, isSubmitting }
    } = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { email: lockedEmail ?? '', code: '', password: '', confirmPassword: '' }
    })

    // The address is known: the code comes next.
    useEffect(() => {
        if (lockedEmail) setFocus('code')
    }, [lockedEmail, setFocus])

    const email = useWatch({ control: formControl, name: 'email' })
    const password = useWatch({ control: formControl, name: 'password' })

    async function onSubmit(values: Values) {
        setFormError(null)
        setServerRules([])
        const { email: address, code, password: newPassword } = schema.parse(values)
        try {
            await startSession(await authApi.resetPassword(address, code, newPassword))
            toast.success(t('resetPassword.done'))
            void navigate(safeRedirect(redirect), { replace: true })
        } catch (error) {
            const failure = authFormError(error)
            if (failure.passwordRules.length > 0) setServerRules(failure.passwordRules)
            else setFormError(failure.message)
        }
    }

    return (
        <AuthCard
            title={t('resetPassword.title')}
            subtitle={t('resetPassword.subtitle')}
            notice={
                formError ? (
                    <Notice tone='error'>{formError}</Notice>
                ) : handedOver.notice === 'code-sent' && lockedEmail ? (
                    <Notice tone='info'>{t('resetPassword.codeSent')}</Notice>
                ) : null
            }
            footer={
                <>
                    <p>
                        {t('resetPassword.noCode')}{' '}
                        {resendWait.remaining > 0 ? (
                            <span className='text-muted-foreground'>
                                {t('resetPassword.sendAgainIn', { seconds: resendWait.remaining })}
                            </span>
                        ) : (
                            <Link
                                to={withRedirect(AUTH_PATHS.forgotPassword, redirect)}
                                state={authPageState(email || undefined)}
                                className='font-medium text-primary hover:underline'
                            >
                                {t('resetPassword.sendAgain')}
                            </Link>
                        )}
                    </p>
                    <p>
                        <Link
                            to={withRedirect(AUTH_PATHS.signIn, redirect)}
                            className='font-medium text-primary hover:underline'
                        >
                            {t('resetPassword.backToSignIn')}
                        </Link>
                    </p>
                </>
            }
        >
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                {lockedEmail ? (
                    <SentTo email={lockedEmail} changeAt={withRedirect(AUTH_PATHS.forgotPassword, redirect)} />
                ) : (
                    <FormField label={t('fields.email')} error={errors.email?.message}>
                        {(control) => <Input type='email' autoComplete='email' {...control} {...register('email')} />}
                    </FormField>
                )}
                <FormField label={t('fields.code')} error={errors.code?.message}>
                    {(control) => (
                        <Input
                            inputMode='numeric'
                            autoComplete='one-time-code'
                            maxLength={7}
                            className='text-center text-lg tracking-[0.5em]'
                            {...control}
                            {...register('code')}
                        />
                    )}
                </FormField>
                <div className='space-y-2'>
                    <FormField label={t('fields.newPassword')} error={errors.password?.message}>
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
                <p className='text-xs text-muted-foreground'>{t('resetPassword.signsOut')}</p>
                <Button type='submit' className='w-full' disabled={isSubmitting}>
                    {isSubmitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
                </Button>
            </form>
        </AuthCard>
    )
}

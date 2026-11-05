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
import { authApi } from '@/features/auth/api/auth.api'
import { AUTH_PATHS, withRedirect } from '@/features/auth/lib/paths'
import { authPageState, useAuthPageState } from '@/features/auth/lib/page-state'
import { authFormError } from '@/features/auth/lib/form-errors'
import { authFields } from '@/features/auth/lib/schemas'
import { useResendCooldown } from '@/features/auth/hooks/useResendCooldown'
import { recordCodeSent, secondsUntilResend } from '@/features/auth/lib/code-sent'
import { AuthCard, Notice } from '@/features/auth/components/AuthCard'

const createSchema = (t: TFunction<'auth'>) => z.object({ email: authFields(t).email })

type Values = z.infer<ReturnType<typeof createSchema>>

/**
 * Ask for a code to choose a new password. The API answers the same whether
 * or not the address has an account, so this page always moves on.
 */
export default function ForgotPassword() {
    const { t } = useTranslation('auth')
    const handedOver = useAuthPageState()
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const redirect = params.get('redirect')
    const [formError, setFormError] = useState<string | null>(null)
    // After a refusal by a limit: how long until the API takes another request.
    // Counted from when the last code went to the address handed over, if one did in this tab.
    const wait = useResendCooldown(secondsUntilResend('password-reset', handedOver.email))
    const schema = useMemo(() => createSchema(t), [t])
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: handedOver.email ?? '' } })

    async function onSubmit({ email }: Values) {
        setFormError(null)
        try {
            await authApi.forgotPassword(email)
            recordCodeSent('password-reset', email)
            void navigate(withRedirect(AUTH_PATHS.resetPassword, redirect), {
                state: authPageState(email, 'code-sent')
            })
        } catch (error) {
            const failure = authFormError(error)
            if (failure.retryAfterSeconds) wait.start(failure.retryAfterSeconds)
            setFormError(failure.message)
        }
    }

    return (
        <AuthCard
            title={t('forgotPassword.title')}
            subtitle={t('forgotPassword.subtitle')}
            notice={formError ? <Notice tone='error'>{formError}</Notice> : null}
            footer={
                <Link
                    to={withRedirect(AUTH_PATHS.signIn, redirect)}
                    className='font-medium text-primary hover:underline'
                >
                    {t('forgotPassword.backToSignIn')}
                </Link>
            }
        >
            <form onSubmit={handleSubmit(onSubmit)} className='space-y-4' noValidate>
                <FormField label={t('fields.email')} error={errors.email?.message}>
                    {(control) => <Input type='email' autoComplete='email' {...control} {...register('email')} />}
                </FormField>
                <Button type='submit' className='w-full' disabled={isSubmitting || wait.remaining > 0}>
                    {isSubmitting
                        ? t('forgotPassword.submitting')
                        : wait.remaining > 0
                          ? t('forgotPassword.submitIn', { seconds: wait.remaining })
                          : t('forgotPassword.submit')}
                </Button>
            </form>
        </AuthCard>
    )
}

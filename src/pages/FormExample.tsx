import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/form/FormField'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { USERS_PATHS } from '@/features/users'
import { useMemo } from 'react'
import type { TFunction } from 'i18next'

// Built with t() so validation messages follow the selected language.
const createFormSchema = (t: TFunction<['pages', 'common']>) =>
    z.object({
        email: z.email(t('common:validation.emailInvalid')),
        password: z.string().min(6, t('common:validation.passwordTooShort'))
    })

type FormValues = z.infer<ReturnType<typeof createFormSchema>>

export default function LoginForm() {
    const navigate = useNavigate()
    const { t } = useTranslation(['pages', 'common'])
    const formSchema = useMemo(() => createFormSchema(t), [t])
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting }
    } = useForm<FormValues>({
        resolver: zodResolver(formSchema)
    })

    async function onSubmit(values: FormValues) {
        try {
            // NOTE: This is just an example for the starter: a "Form Handling"
            // demonstration, not the app's sign-in. It posts nowhere.

            // Simulate API call
            await new Promise((resolve) => setTimeout(resolve, 1000))

            console.log(values)
            toast.success(t('formExample.successToast'), {
                description: t('formExample.successDescription')
            })
            void navigate(USERS_PATHS.profile)
        } catch (error) {
            toast.error(t('formExample.failedToast'))
            console.error(error)
        }
    }

    return (
        <div className='flex min-h-screen items-center justify-center bg-gray-50/50 dark:bg-gray-900/50 py-12 px-4 sm:px-6 lg:px-8'>
            <div className='w-full max-w-md space-y-8 bg-background p-10 rounded-xl border shadow-sm'>
                <div className='text-center'>
                    <h2 className='text-2xl font-bold tracking-tight'>{t('formExample.title')}</h2>
                    <p className='mt-2 text-sm text-muted-foreground'>{t('formExample.subtitle')}</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className='space-y-6'>
                    <FormField label={t('formExample.email')} error={errors.email?.message} className='space-y-2'>
                        {(control) => (
                            <Input type='email' placeholder='name@example.com' {...control} {...register('email')} />
                        )}
                    </FormField>

                    <FormField label={t('formExample.password')} error={errors.password?.message} className='space-y-2'>
                        {(control) => <Input type='password' {...control} {...register('password')} />}
                    </FormField>

                    <Button type='submit' className='w-full' disabled={isSubmitting}>
                        {isSubmitting ? t('formExample.submitting') : t('formExample.submit')}
                    </Button>
                </form>
            </div>
        </div>
    )
}

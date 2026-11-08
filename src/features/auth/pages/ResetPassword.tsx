import { useEffect } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuthStore } from '@/features/auth/auth.store'
import { afterSignIn, AUTH_PATHS, withFlow } from '@/features/auth/lib/paths'
import { authPageState, useAuthPageState } from '@/features/auth/lib/page-state'
import { useCodeReset } from '@/features/auth/hooks/useCodeReset'
import { AuthCard } from '@/features/auth/components/AuthCard'
import { ResendLine, ResetCodeField, ResetNotice, ResetPasswordField } from '@/features/auth/components/CodeReset'

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
    const navigate = useNavigate()
    const location = useLocation()
    const startSession = useAuthStore((state) => state.startSession)
    const reset = useCodeReset({
        email,
        onReset: async (tokens) => {
            await startSession(tokens)
            toast.success(t('resetPassword.done'))
            const { isComplete, deletesAt } = useAuthStore.getState()
            const account = { completed: isComplete, pendingDeletion: deletesAt !== null }
            // Waiting to be deleted: sign in, on the password just chosen, under the restore dialog.
            void navigate(afterSignIn(account, location.search, 'password'), {
                replace: true,
                state: authPageState(email)
            })
        }
    })
    useDocumentTitle(t('resetPassword.tab'))

    // focusCode never changes: focus once, on arrival.
    const { focusCode } = reset
    useEffect(focusCode, [focusCode])

    /** Back to step one, the address still there (C-34). */
    function back() {
        if (location.key !== 'default') return void navigate(-1)
        void navigate(withFlow(AUTH_PATHS.forgotPassword, location.search), { state: authPageState(email) })
    }

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
                <form onSubmit={reset.onSubmit} className='space-y-4' noValidate>
                    <ResetCodeField reset={reset} visibleLabel={t('resetPassword.codeLabel')} />
                    <ResetPasswordField reset={reset} />
                    <p className='text-label text-text-tertiary'>{t('resetPassword.signsOut')}</p>
                    <ResetNotice reset={reset} />
                    <Button type='submit' className='w-full' disabled={reset.submitDisabled}>
                        {reset.busy ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {reset.phase === 'expired' ? t('resetPassword.sendNew') : t('resetPassword.submit')}
                    </Button>
                </form>
                <ResendLine reset={reset} />
            </AuthCard>
        </div>
    )
}

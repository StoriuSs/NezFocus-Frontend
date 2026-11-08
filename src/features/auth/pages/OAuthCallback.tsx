import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageLoader } from '@/components/PageLoader'
import { useAuthStore } from '@/features/auth/auth.store'
import { afterSignIn, AUTH_PATHS, signInPath } from '@/features/auth/lib/paths'
import { oauthFailure, type OAuthFailure } from '@/features/auth/lib/oauth'
import { authPageState } from '@/features/auth/lib/page-state'
import { AuthCard, Notice } from '@/features/auth/components/AuthCard'

/**
 * Where the API sends the browser back after signing in with Google.
 *
 * On success the API has set the refresh cookie and nothing else: this page
 * trades it for an access token, as a reload does, then goes on as every
 * sign-in does (01-auth.md › Điều hướng): an account made just now, or never
 * completed, to "complete your account"; otherwise where the person was
 * heading. The API hands that back as `?redirect=` (checked again here). On
 * failure the API names the reason in `?error=`.
 */
export default function OAuthCallback() {
    const { t } = useTranslation('auth')
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const resumeFromCookie = useAuthStore((state) => state.resumeFromCookie)
    const [failure, setFailure] = useState<OAuthFailure | null>(() => oauthFailure(params.get('error')))
    const started = useRef(false)
    const next = params.get('redirect')

    useEffect(() => {
        // Once, even when React runs effects twice in development.
        if (failure || started.current) return
        started.current = true
        void resumeFromCookie().then((signedIn) => {
            if (!signedIn) return setFailure('failed')
            const { isComplete, deletesAt, user } = useAuthStore.getState()
            const account = { completed: isComplete, pendingDeletion: deletesAt !== null }
            void navigate(afterSignIn(account, next ? new URLSearchParams({ next }) : ''), {
                replace: true,
                state: authPageState(account.pendingDeletion ? user?.email : undefined, { via: 'google' })
            })
        })
    }, [failure, navigate, next, resumeFromCookie])

    if (!failure) return <PageLoader className='min-h-40' />

    return (
        <AuthCard
            title={t('oauthCallback.title')}
            notice={<Notice tone='error'>{t(`oauthCallback.errors.${failure}`)}</Notice>}
            footer={
                <Link
                    to={next ? signInPath(next) : AUTH_PATHS.signIn}
                    replace
                    className='font-medium text-primary hover:underline'
                >
                    {t('oauthCallback.backToSignIn')}
                </Link>
            }
        >
            {null}
        </AuthCard>
    )
}

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageLoader } from '@/components/PageLoader'
import { useAuthStore } from '@/features/auth/auth.store'
import { AUTH_PATHS, safeRedirect, withRedirect } from '@/features/auth/lib/paths'
import { oauthFailure, type OAuthFailure } from '@/features/auth/lib/oauth'
import { AuthCard, Notice } from '@/features/auth/components/AuthCard'

/**
 * Where the API sends the browser back after signing in with Google.
 *
 * On success the API has set the refresh cookie and nothing else: this page
 * trades it for an access token, as a reload does, then goes where the person
 * was heading (`?redirect=`, checked again here). On failure the API names
 * the reason in `?error=`. With `?notice=password_removed`, it says a
 * never-confirmed sign-up's password was removed on linking.
 */
export default function OAuthCallback() {
    const { t } = useTranslation('auth')
    const [params] = useSearchParams()
    const navigate = useNavigate()
    const resumeFromCookie = useAuthStore((state) => state.resumeFromCookie)
    const [failure, setFailure] = useState<OAuthFailure | null>(() => oauthFailure(params.get('error')))
    const started = useRef(false)

    useEffect(() => {
        // Once, even when React runs effects twice in development.
        if (failure || started.current) return
        started.current = true
        // Linking removed a password set when the address was signed up and
        // never confirmed: say so, rather than let it vanish unannounced.
        if (params.get('notice') === 'password_removed') {
            toast.info(t('oauthCallback.passwordRemoved'), { duration: 15_000 })
        }
        void resumeFromCookie().then((signedIn) => {
            if (signedIn) void navigate(safeRedirect(params.get('redirect')), { replace: true })
            else setFailure('failed')
        })
    }, [failure, navigate, params, resumeFromCookie, t])

    if (!failure) return <PageLoader className='min-h-40' />

    return (
        <AuthCard
            title={t('oauthCallback.title')}
            notice={<Notice tone='error'>{t(`oauthCallback.errors.${failure}`)}</Notice>}
            footer={
                <Link
                    to={withRedirect(AUTH_PATHS.signIn, params.get('redirect'))}
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

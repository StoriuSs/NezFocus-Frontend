import { useTranslation } from 'react-i18next'
import { ShellPage } from '@/components/shell/ShellPage'
import { Button } from '@/components/ui/button'
import { useProfile } from '@/features/users'
import { ChangePasswordDialog } from '@/features/auth/components/ChangePasswordDialog'
import { SessionsSection } from '@/features/auth/components/SessionsSection'
import { DeleteAccountSection } from '@/features/auth/components/DeleteAccountSection'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow'

/** The account settings page (S-ME-03): sign-in, password, sessions and deleting the account, in the AppShell. */
export default function Settings() {
    const { t } = useTranslation('auth')
    return (
        <ShellPage title={t('settings.title')}>
            <SettingsContent />
        </ShellPage>
    )
}

function SettingsContent() {
    const { t } = useTranslation('auth')
    const { t: tCommon } = useTranslation()
    // The profile query, not the store's copy from sign-in: it retries, and
    // it is read again after "complete your account" (the username).
    const { data: profile, error, refetch } = useProfile()
    const email = profile?.email ?? undefined
    const username = profile?.username ?? undefined

    return (
        <div className='max-w-settings space-y-8 p-6 lg:p-8'>
            <SettingsGroup id='sign-in' title={t('settings.signIn.title')}>
                {!profile && error ? (
                    <div className='flex flex-col items-start gap-4 py-2'>
                        <p className='text-body-sm text-text-secondary'>{tCommon('users:profile.failedToLoad')}</p>
                        <Button variant='outline' size='sm' onClick={() => void refetch()}>
                            {tCommon('buttons.tryAgain')}
                        </Button>
                    </div>
                ) : (
                    <>
                        <SettingsRow
                            label={t('settings.signIn.email')}
                            value={email}
                            description={t('settings.signIn.emailHint')}
                        />
                        {/* Every account has a password (D-130). */}
                        <SettingsRow
                            label={t('settings.signIn.password')}
                            description={t('settings.signIn.passwordHint')}
                            control={email ? <ChangePasswordDialog email={email} username={username} /> : null}
                        />
                    </>
                )}
            </SettingsGroup>

            <SessionsSection />

            {email ? <DeleteAccountSection email={email} username={username} /> : null}
        </div>
    )
}

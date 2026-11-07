import { useTranslation } from 'react-i18next'
import { ShellPage } from '@/components/shell/ShellPage'
import { useAuthStore } from '@/features/auth/auth.store'
import { ChangePasswordDialog } from '@/features/auth/components/ChangePasswordDialog'
import { SessionsSection } from '@/features/auth/components/SessionsSection'
import { DeleteAccountDialog } from '@/features/auth/components/DeleteAccountDialog'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow'

/** The account settings page (S-ME-03): sign-in, password and sessions, in the AppShell. */
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
    const user = useAuthStore((state) => state.user)

    return (
        <div className='max-w-[720px] space-y-8 p-6 lg:p-8'>
            <SettingsGroup id='sign-in' title={t('settings.signIn.title')}>
                <SettingsRow
                    label={t('settings.signIn.email')}
                    value={user?.email}
                    description={t('settings.signIn.emailHint')}
                />
                {/* Every account has a password (D-130). */}
                <SettingsRow
                    label={t('settings.signIn.password')}
                    description={t('settings.signIn.passwordHint')}
                    control={user?.email ? <ChangePasswordDialog email={user.email} username={user.username} /> : null}
                />
            </SettingsGroup>

            <SessionsSection />

            {/* The base's dialog until L14 builds this group (S-ME-03 `delete-confirm`). */}
            <DeleteAccountDialog />
        </div>
    )
}

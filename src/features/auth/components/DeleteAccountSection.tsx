import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/deletion'
import { Button } from '@/components/ui/button'
import { SettingsGroup } from '@/components/settings/SettingsRow'
import { DeleteAccountDialog } from './DeleteAccountDialog'

/**
 * "Delete account" on the account page (10-settings › S-ME-03): what it
 * means, and the button that opens the dialog, mounted while open so it
 * opens empty every time ("Forgot password?" is the dialog's own).
 *
 * Servers arrive in M1: then an Owner of servers with other members is told
 * to hand them over first (`delete-blocked-owner`), before any password.
 */
export function DeleteAccountSection({ email, username }: { email: string; username?: string | null }) {
    const { t } = useTranslation('deletion')
    const [open, setOpen] = useState(false)

    return (
        <SettingsGroup id='delete-account' title={t('section.title')}>
            <p className='max-w-[448px] py-2 text-body-sm text-text-secondary'>{t('section.description')}</p>
            <Button variant='destructive' size='sm' onClick={() => setOpen(true)}>
                {t('section.open')}
            </Button>
            {open ? <DeleteAccountDialog email={email} username={username} onClose={() => setOpen(false)} /> : null}
        </SettingsGroup>
    )
}

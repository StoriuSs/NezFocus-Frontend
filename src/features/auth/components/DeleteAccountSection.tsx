import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/deletion'
import { Button } from '@/components/ui/button'
import { SettingsGroup } from '@/components/settings/SettingsRow'
import type { RequestFailure } from '@/features/auth/lib/form-problem'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { PasswordDialog } from './ChangePasswordDialog'

/**
 * "Delete account" on the account page (10-settings › S-ME-03): what it
 * means, and the button that opens the dialog. "Forgot password?" in that
 * dialog closes it and opens the password dialog on the emailed code; Back,
 * or a new password set, opens it again with the field empty (S-ME-03 ›
 * Tương tác).
 *
 * Servers arrive in M1: then an Owner of servers with other members is told
 * to hand them over first (`delete-blocked-owner`), before any password.
 */
export function DeleteAccountSection({ email, username }: { email: string; username?: string | null }) {
    const { t } = useTranslation('deletion')
    const [open, setOpen] = useState(false)
    // Set while the password dialog stands in for this one, on the code.
    const [reset, setReset] = useState<{ failure: RequestFailure | null } | null>(null)

    function backHere() {
        setReset(null)
        setOpen(true)
    }

    return (
        <SettingsGroup id='delete-account' title={t('section.title')}>
            <p className='max-w-[448px] py-2 text-body-sm text-text-secondary'>{t('section.description')}</p>
            <Button variant='destructive' size='sm' onClick={() => setOpen(true)}>
                {t('section.open')}
            </Button>
            {/* Mounted while open, so it opens empty every time. */}
            {open ? (
                <DeleteAccountDialog
                    email={email}
                    open
                    onOpenChange={setOpen}
                    onForgot={(failure) => {
                        setOpen(false)
                        setReset({ failure })
                    }}
                />
            ) : null}
            {reset ? (
                <PasswordDialog
                    email={email}
                    username={username}
                    open
                    startWith={{ kind: 'code', failure: reset.failure }}
                    onClose={() => setReset(null)}
                    onBack={backHere}
                    onDone={backHere}
                />
            ) : null}
        </SettingsGroup>
    )
}

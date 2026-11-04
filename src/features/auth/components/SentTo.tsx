import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authPageState } from '../lib/page-state'

interface SentToProps {
    email: string
    /** The page that asked for the address, to go back and type another. */
    changeAt: string
}

/**
 * The address a code went to, as text rather than a field. A code works only
 * for the account it was sent to, so editing the address here could only
 * produce "wrong code"; changing it means asking again, on the page that
 * asked for it, with the address still filled in.
 */
export function SentTo({ email, changeAt }: SentToProps) {
    const { t } = useTranslation('auth')
    return (
        <div className='flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm'>
            {/* For password managers: the account a new password on this form belongs to. */}
            <input type='email' name='username' autoComplete='username' value={email} readOnly hidden />
            <p className='min-w-0'>
                <span className='text-muted-foreground'>{t('sentTo.label')} </span>
                <span className='font-medium break-all' data-testid='sent-to'>
                    {email}
                </span>
            </p>
            <Link
                to={changeAt}
                state={authPageState(email)}
                className='shrink-0 font-medium text-primary hover:underline'
            >
                {t('sentTo.change')}
            </Link>
        </div>
    )
}

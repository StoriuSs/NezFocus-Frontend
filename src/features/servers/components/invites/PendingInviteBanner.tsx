import '@/i18n/servers'
import { Trans } from 'react-i18next'
import { Mail } from 'lucide-react'
import { Banner } from '@/components/Banner'
import { useInvitePreview } from '../../api/useInvites'

/**
 * "Your invite to … is waiting" at the top of the sign-up, code, sign-in and
 * finish-your-account forms (01 › Lời mời đang chờ). Nothing while it loads,
 * or when the invite no longer opens: the invite page says that after.
 */
export default function PendingInviteBanner({ code, finishing }: { code: string; finishing: boolean }) {
    const preview = useInvitePreview(code, null)
    if (!preview.data) return null
    return (
        <Banner icon={Mail} className='mb-6'>
            <Trans
                ns='servers'
                i18nKey={finishing ? 'join.pendingWelcome' : 'join.pending'}
                values={{ server: preview.data.server.name }}
                components={[<strong key='server' className='font-semibold text-text-primary' />]}
            />
        </Banner>
    )
}

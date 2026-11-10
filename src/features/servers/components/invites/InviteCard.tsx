import '@/i18n/servers'
import { useTranslation } from 'react-i18next'
import { Hash, LampDesk, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ServerIcon } from '../ServerIcon'
import type { InvitePreview } from '../../types'

/**
 * InviteCard (C-38): the server's picture at 72, its name, its members, and
 * the channel the link leads to when someone joining may see it (SRV-04: the
 * name only, never who is in a room). Online counts come with presence (M2,
 * D-143). On `bg` it is `surface-1`; in a dialog, `surface-2`.
 */
export function InviteCard({ preview, inDialog = false }: { preview: InvitePreview; inDialog?: boolean }) {
    const { t, i18n } = useTranslation('servers')
    const { server, channel } = preview
    const members = new Intl.NumberFormat(i18n.language === 'vi' ? 'vi-VN' : 'en-US').format(server.memberCount)
    const TargetIcon = channel?.isStudyRoom ? LampDesk : channel?.type === 'voice' ? Volume2 : Hash
    const targetLead = channel?.isStudyRoom ? 'studyRoom' : channel?.type === 'voice' ? 'voice' : 'text'

    return (
        <div
            className={cn(
                'grid gap-3 rounded-button border border-border p-4',
                inDialog ? 'bg-surface-2' : 'bg-surface-1'
            )}
        >
            <div className='flex items-center gap-4'>
                <ServerIcon
                    name={server.name}
                    iconUrl={server.iconUrl}
                    className={cn('size-[72px] shrink-0 rounded-[33%] text-title-2', inDialog && 'bg-surface-3')}
                />
                <div className='grid min-w-0 gap-1'>
                    <p className='line-clamp-2 text-title-2 font-semibold text-text-primary'>{server.name}</p>
                    <p className='text-label text-text-secondary'>
                        {t('join.members', { count: server.memberCount, members })}
                    </p>
                </div>
            </div>
            {channel ? (
                <p className='flex items-center gap-2 border-t border-border pt-3 text-body-sm text-text-secondary'>
                    <TargetIcon className='size-4 shrink-0' aria-hidden='true' />
                    <span className='min-w-0 truncate'>
                        {t(`join.target.${targetLead}`)}{' '}
                        <strong className='font-semibold text-text-primary'>
                            {channel.type === 'text' ? `#${channel.name}` : channel.name}
                        </strong>
                    </span>
                </p>
            ) : null}
        </div>
    )
}

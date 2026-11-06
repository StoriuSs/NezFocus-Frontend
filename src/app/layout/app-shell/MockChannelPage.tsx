import { Navigate, useParams } from 'react-router-dom'
import { Crown, Hash, LampDesk, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@/components/ui/icon-button'
import { PresenceDot } from '@/components/ui/presence-dot'
import { WithTooltip } from '@/components/ui/tooltip'
import { RightPanel, usePanel } from '@/components/shell/RightPanel'
import { ShellPage } from '@/components/shell/ShellPage'
import { findServer, MOCK_MEMBERS, type MockMember } from './mock-data'

function MemberGroup({ title, members }: { title: string; members: MockMember[] }) {
    const { t } = useTranslation()
    if (members.length === 0) return null
    return (
        <section aria-label={title} className='mb-4'>
            <h3 className='flex h-8 items-center px-2 text-label font-semibold uppercase text-text-tertiary'>
                {title}
            </h3>
            <ul>
                {members.map((member) => (
                    <li key={member.name} className='flex h-10 items-center gap-3 rounded-input px-2 text-body-sm'>
                        <span className='relative'>
                            <span className='flex size-8 items-center justify-center rounded-full bg-surface-3 text-label font-semibold text-text-primary'>
                                {member.name.slice(0, 1)}
                            </span>
                            <PresenceDot
                                presence={member.presence}
                                cutout='ring-surface-1'
                                className='absolute -bottom-0.5 -right-0.5'
                            />
                        </span>
                        <span
                            className={
                                member.presence === 'offline'
                                    ? 'truncate text-text-tertiary'
                                    : 'truncate text-text-secondary'
                            }
                        >
                            {member.name}
                        </span>
                        {member.owner ? (
                            <Crown
                                role='img'
                                className='size-3.5 shrink-0 text-text-tertiary'
                                aria-label={t('shell.members.owner')}
                            />
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    )
}

/**
 * A channel of a mock server: the Header and the members panel, with an empty
 * content area. Lets the three-column AppShell be tried at every width before
 * channels exist (M2). Replaced by the real channel page then.
 */
export default function MockChannelPage() {
    const { t } = useTranslation()
    const { serverId, channelId } = useParams()
    const [panel, panelButton] = usePanel('members')
    const server = findServer(serverId)
    const channels = server?.categories.flatMap((category) => category.channels) ?? []
    const channel = channels.find((candidate) => candidate.id === channelId)

    if (!server) return <Navigate to='/study' replace />
    if (!channel) return <Navigate to={`/channels/${server.id}/${channels[0]!.id}`} replace />

    const online = MOCK_MEMBERS.filter((member) => member.presence !== 'offline')
    const offline = MOCK_MEMBERS.filter((member) => member.presence === 'offline')

    return (
        <ShellPage
            title={channel.name}
            icon={channel.kind === 'study-room' ? LampDesk : Hash}
            actions={
                <WithTooltip label={t('shell.members.title')} side='bottom'>
                    <IconButton
                        ref={panelButton}
                        label={t('shell.members.title')}
                        on={panel.open}
                        onClick={panel.toggle}
                    >
                        <Users />
                    </IconButton>
                </WithTooltip>
            }
            panel={
                <RightPanel state={panel} buttonRef={panelButton} title={t('shell.members.title')}>
                    <MemberGroup title={t('shell.members.online', { count: online.length })} members={online} />
                    <MemberGroup title={t('shell.members.offline', { count: offline.length })} members={offline} />
                </RightPanel>
            }
        />
    )
}

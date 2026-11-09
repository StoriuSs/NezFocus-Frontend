import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, FolderPlus, PlusCircle } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useServers } from '../../api/useServers'
import { useChannelDialogs } from '../../channel-dialogs.store'
import { can } from '../../lib/permissions'
import type { Server } from '../../types'
import { ChannelList } from './ChannelList'

/**
 * The server's name over its channels, 48 high, level with the page Header's
 * rule. With rows to offer it opens the server menu (S-SRV-04, C-15): a row
 * shows only to who may use it, never disabled. L4 brings "Create channel"
 * and "Create category" (MANAGE_CHANNELS); invite (L6), server settings (L5)
 * and leave (L9) join it with their slices. With no row, it is a plain title.
 */
function ServerMenu({ server }: { server: Server }) {
    const { t } = useTranslation()
    const show = useChannelDialogs((state) => state.show)
    const [open, setOpen] = useState(false)
    const managesChannels = can(server.permissions, 'MANAGE_CHANNELS')

    if (!managesChannels) {
        return (
            <div className='flex h-12 shrink-0 items-center border-b px-4'>
                <h2 className='min-w-0 flex-1 truncate text-headline text-text-primary'>{server.name}</h2>
            </div>
        )
    }

    return (
        <h2 className='flex h-12 shrink-0 border-b'>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger
                    className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 px-4 text-left text-headline text-text-primary transition-colors duration-micro hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                        open && 'bg-surface-2'
                    )}
                >
                    <span className='min-w-0 flex-1 truncate'>{server.name}</span>
                    <ChevronDown
                        className={cn('size-4 shrink-0 transition-transform duration-micro', open && 'rotate-180')}
                        aria-hidden='true'
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start' alignOffset={8} className='w-56'>
                    <DropdownMenuItem
                        onSelect={() =>
                            show({ kind: 'createChannel', serverId: server.id, categoryId: null, type: 'text' })
                        }
                    >
                        <PlusCircle aria-hidden='true' />
                        {t('shell.serverMenu.createChannel')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => show({ kind: 'createCategory', serverId: server.id })}>
                        <FolderPlus aria-hidden='true' />
                        {t('shell.serverMenu.createCategory')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </h2>
    )
}

/** The list column on a server's pages (02 S-SHELL-01): its menu, then its channels. */
export function ServerChannelColumn({ serverId }: { serverId: string | undefined }) {
    const { t } = useTranslation()
    const server = useServers().data?.find((candidate) => candidate.id === serverId)
    if (!server) return null
    return (
        <>
            <ServerMenu server={server} />
            <nav
                aria-label={t('shell.channels.label', { name: server.name })}
                className='min-h-0 flex-1 overflow-y-auto p-2'
            >
                <ChannelList server={server} />
            </nav>
        </>
    )
}

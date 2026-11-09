import '@/i18n/servers'
import { useEffect } from 'react'
import { useServers } from '../../api/useServers'
import { useChannelDialogs } from '../../channel-dialogs.store'
import { CategorySettingsDialog, CreateCategoryDialog } from './CategoryDialogs'
import { ChannelSettingsDialog } from './ChannelSettingsDialog'
import { CreateChannelDialog } from './CreateChannelDialog'

/**
 * Whichever channel list dialog is open (S-SRV-05, S-SET-05), on the server
 * as the cache now has it. Loaded by the AppShell the first time one opens.
 * When the server, channel or category it is about is gone (the list was
 * read again meanwhile), it closes.
 */
export default function ChannelDialogs() {
    const { open, hide } = useChannelDialogs()
    const servers = useServers().data
    const server = servers?.find((candidate) => candidate.id === open?.serverId)
    const channel = open?.kind === 'channelSettings' ? server?.channels.find((c) => c.id === open.channelId) : undefined
    const category =
        open?.kind === 'categorySettings' ? server?.categories.find((c) => c.id === open.categoryId) : undefined
    // Gone only once the list is there: while it loads, nothing is known yet.
    const missing =
        servers !== undefined &&
        (!server || (open?.kind === 'channelSettings' && !channel) || (open?.kind === 'categorySettings' && !category))

    useEffect(() => {
        if (open && missing) hide()
    }, [open, missing, hide])

    if (!open || !server || missing) return null
    switch (open.kind) {
        case 'createChannel':
            return <CreateChannelDialog server={server} categoryId={open.categoryId} type={open.type} onClose={hide} />
        case 'createCategory':
            return <CreateCategoryDialog server={server} onClose={hide} />
        case 'channelSettings':
            return <ChannelSettingsDialog key={channel!.id} server={server} channel={channel!} onClose={hide} />
        case 'categorySettings':
            return <CategorySettingsDialog key={category!.id} server={server} category={category!} onClose={hide} />
    }
}

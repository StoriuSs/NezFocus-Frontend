import '@/i18n/servers'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useServers } from '../../api/useServers'
import { useChannelDialogs } from '../../channel-dialogs.store'
import { CategorySettingsDialog, CreateCategoryDialog } from './CategoryDialogs'
import { ChannelSettingsDialog } from './ChannelSettingsDialog'
import { CreateChannelDialog } from './CreateChannelDialog'

/** What a settings dialog was about when last seen, to name it once it is gone. */
interface Seen {
    id: string
    kind: 'channel' | 'room' | 'category'
    name: string
}

/**
 * Whichever channel list dialog is open (S-SRV-05, S-SET-05), on the server
 * as the cache now has it. Loaded by the AppShell the first time one opens.
 * When the server, channel or category it is about is gone (the list was
 * read again meanwhile), it closes. A channel or category gone from a server
 * still there is named in a Toast (04 SET-EDGE): "#viec-nhom is no longer
 * available", not "deleted", as it may only have gone private to them (the
 * event does not say which); a category has no privacy, so it was deleted.
 * A whole server gone says nothing here: its dialog or Toast does. Deleted
 * from this dialog, it closes before the list changes, and says it itself.
 */
export default function ChannelDialogs() {
    const { t } = useTranslation('servers')
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

    const [seen, setSeen] = useState<Seen | null>(null)
    const now: Seen | null = channel
        ? { id: channel.id, kind: channel.type === 'voice' ? 'room' : 'channel', name: channel.name }
        : category
          ? { id: category.id, kind: 'category', name: category.name }
          : null
    if (now && (now.id !== seen?.id || now.name !== seen.name)) setSeen(now)

    const goneId =
        open?.kind === 'channelSettings' ? open.channelId : open?.kind === 'categorySettings' ? open.categoryId : null
    useEffect(() => {
        if (!open || !missing) return
        hide()
        if (!server || !seen || seen.id !== goneId) return
        const message =
            seen.kind === 'category'
                ? t('layoutError.categoryGone', { name: seen.name.toLocaleUpperCase('vi') })
                : t(seen.kind === 'room' ? 'layoutError.roomGone' : 'layoutError.channelGone', { name: seen.name })
        toast(message, { id: `layout-gone-${seen.id}` })
    }, [open, missing, hide, server, seen, goneId, t])

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

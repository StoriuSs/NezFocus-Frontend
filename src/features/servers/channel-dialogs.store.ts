import { create } from 'zustand'
import type { ChannelType } from './lib/channel-layout'

/** Which channel list dialog is open, and on what. */
export type ChannelDialog =
    /** S-SRV-05: from the server menu (text, no category) or a category's ＋ (that category). */
    | { kind: 'createChannel'; serverId: string; categoryId: string | null; type: ChannelType }
    | { kind: 'createCategory'; serverId: string }
    /** S-SET-05 `text` / `voice`. */
    | { kind: 'channelSettings'; serverId: string; channelId: string }
    /** S-SET-05 `category-edit`. */
    | { kind: 'categorySettings'; serverId: string; categoryId: string }

interface ChannelDialogsState {
    open: ChannelDialog | null
    show: (dialog: ChannelDialog) => void
    hide: () => void
}

/**
 * The channel list's dialogs (S-SRV-05, S-SET-05). Opened from the server
 * menu and the list's hover buttons, and drawn by the AppShell, which loads
 * them the first time one opens.
 */
export const useChannelDialogs = create<ChannelDialogsState>((set) => ({
    open: null,
    show: (dialog) => set({ open: dialog }),
    hide: () => set({ open: null })
}))

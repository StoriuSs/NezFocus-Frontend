import { lazy } from 'react'

/**
 * What other features use from messaging: a text channel's chat
 * (S-CHAT-01) and its pins panel (S-CHAT-02), which the servers feature's
 * channel page shows. Lazy: the chat, its words and its hooks are a chunk of
 * their own, fetched the first time a channel opens (docs/code-splitting.md);
 * the panel is in that same chunk, with the chat's stylesheet, and so is the
 * cover for files dragged onto the page (`ChatDropZone`).
 *
 * How far the reader has read (REQ-MSG-09) is not lazy: the rail, the
 * channel list and the tab title show it before any chat opens.
 */
export const ChannelChat = lazy(() => import('./components/ChannelChat'))
export const PinsPanel = lazy(() => import('./components/ChannelChat').then((chat) => ({ default: chat.PinsPanel })))
export const ChatDropZone = lazy(() =>
    import('./components/ChannelChat').then((chat) => ({ default: chat.ChatDropZone }))
)
export { useChannelReadState, useMentionedChannels, useMentionTotal, useServerReadState } from './api/useReadStates'
export { forgetChannels } from './api/forgetChannels'
export type {
    AppLink,
    ChatPermissions,
    ChatTarget,
    MentionChannel,
    MentionPerson,
    MentionRole,
    MentionSource,
    SendBlock
} from './types'

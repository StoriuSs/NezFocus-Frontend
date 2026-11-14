import { lazy } from 'react'

/**
 * What other features use from messaging: a text channel's chat
 * (S-CHAT-01) and its pins panel (S-CHAT-02), which the servers feature's
 * channel page shows. Lazy: the chat, its words and its hooks are a chunk of
 * their own, fetched the first time a channel opens (docs/code-splitting.md);
 * the panel is in that same chunk, with the chat's stylesheet.
 */
export const ChannelChat = lazy(() => import('./components/ChannelChat'))
export const PinsPanel = lazy(() => import('./components/ChannelChat').then((chat) => ({ default: chat.PinsPanel })))
export type { AppLink, ChatPermissions, ChatTarget } from './types'

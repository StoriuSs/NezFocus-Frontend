import { lazy } from 'react'

/**
 * What other features use from messaging: a text channel's chat
 * (S-CHAT-01), which the servers feature's channel page shows. Lazy: the
 * chat, its words and its hooks are a chunk of their own, fetched the first
 * time a channel opens (docs/code-splitting.md).
 */
export const ChannelChat = lazy(() => import('./components/ChannelChat'))

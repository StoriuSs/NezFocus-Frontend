import type { InfiniteData } from '@tanstack/react-query'
import type { MentionChannel } from '@/features/messaging'
import type { ApiModel } from '@/lib/api-types'

/** One inbox item (REQ-NOTIF-01): a mention or a reply in M3 L6, the message as it is now (D-184). */
export type Notification = ApiModel<'NotificationResponseDto'>
export type NotificationType = Notification['type']
/** The message a mention or a reply is about: its words, whom it names, its files. */
export type NotificationMessage = ApiModel<'NotificationMessageResponseDto'>
/** A page of the inbox, newest first, with the unread count of the channels one views now. */
export type NotificationList = ApiModel<'NotificationListResponseDto'>
/** POST /me/notifications/read: some items, or every one up to the newest held (NOTIF-02). */
export type MarkNotificationsReadRequest = ApiModel<'MarkNotificationsReadRequestDto'>

/** The inbox in the cache: its pages, each after the oldest item of the one before. */
export type InboxPages = InfiniteData<NotificationList>

/** `notification.created` (SRS 5.2): the whole item. */
export interface NotificationCreated {
    notification: Notification
}

/** `notification.read`: these items, or every one up to `beforeId`, are read now; the count after. */
export interface NotificationsRead {
    ids: string[] | null
    beforeId: string | null
    unreadCount: number
}

/** `notification.deleted`: these items are gone; the count after when it changed, else null. */
export interface NotificationsDeleted {
    ids: string[]
    unreadCount: number | null
}

/** The names of a channel and its server, as the servers list has them. */
export interface InboxPlace {
    serverName: string
    channelName: string
}

/**
 * What the inbox needs from the servers feature, handed by the app (D-197):
 * where an item's channel is (null: one no longer views it; undefined:
 * the list is loading), how a channel mentioned in a message reads, and the
 * path to a message.
 */
export interface InboxPlaces {
    placeOf: (serverId: string, channelId: string) => InboxPlace | null | undefined
    /** A channel mentioned in a message of server `serverId` ("#hoi-dap"), or one not viewed. */
    mentionChannel: (channelId: string, serverId: string) => MentionChannel
    messagePath: (serverId: string, channelId: string, messageId: string) => string
}

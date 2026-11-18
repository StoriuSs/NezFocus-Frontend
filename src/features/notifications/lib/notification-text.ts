import type { TFunction } from 'i18next'
import '@/i18n/notifications'
import { plainMessage, type MentionWords } from '@/features/messaging'
import type { InboxPlace, InboxPlaces, Notification } from '../types'
import { dueDate } from './inbox-time'

/** What a row says (C-29): its title, the message's words, and where it is. */
export interface NotificationText {
    title: string
    /** The message now, plain and on one line (2 lines shown); null when it has nothing to say. */
    content: string | null
    /** "#{kênh} · {Server}"; null while the servers load, or for a channel no longer viewed. */
    source: string | null
    /** The names in it: the row cuts the server's name first, keeping the channel's (C-29). */
    place: InboxPlace | null
}

interface TextSources {
    t: TFunction<'notifications'>
    words: MentionWords
    places: InboxPlaces
    /** Now and the account's zone: a due date says its year when it is another. */
    now: Date
    timeZone?: string
}

/** Who the item is from: the name, else the username; a deleted account says so (D-182). */
function actorName(item: Notification, t: TFunction<'notifications'>): string {
    return item.actor?.displayName ?? item.actor?.username ?? t('row.deletedAccount')
}

/** "@everyone", "@here", "@Trưởng nhóm": what a wide mention reached, the role by its name now. */
function reached(item: Notification, words: MentionWords): string | null {
    switch (item.reason) {
        case 'everyone':
            return '@everyone'
        case 'here':
            return '@here'
        case 'role': {
            const role = item.message?.mentionRoles.find((one) => one.id === item.roleId)
            return role ? `@${role.name}` : words.unknownRole
        }
        default:
            return null
    }
}

/** The message's words, mentions by name, on one line; "Đã gửi 3 tệp" for files alone. */
function contentOf(item: Notification, { t, words, places }: TextSources): string | null {
    const message = item.message
    if (!message) return null
    const names = {
        users: message.mentionUsers,
        roles: message.mentionRoles,
        channel: (channelId: string) => places.mentionChannel(channelId, item.serverId ?? '')
    }
    const said = plainMessage(message.content, names, words).replace(/\s+/g, ' ').trim()
    if (said) return said
    const { count, images } = message.files
    if (count === 0) return null
    const allImages = count === images
    if (count === 1) return t(allImages ? 'row.image' : 'row.file')
    return allImages ? t('row.images', { count }) : t('row.files', { count })
}

/**
 * The words of a task item, as the task was when it was made (D-98): who gave
 * it and its due date then; how long is left before it is due, no line under
 * it (05 R3); no one on it any more, and why (D-95).
 */
function taskWords(item: Notification, { t, now, timeZone }: TextSources): { title: string; content: string | null } {
    const task = item.task
    const title = task?.title ?? ''
    const name = actorName(item, t)
    switch (item.type) {
        case 'task_assigned':
            return {
                title: t('row.taskAssigned', { name, title }),
                content: task?.dueAt
                    ? t('row.taskDue', { due: dueDate(new Date(task.dueAt), now, timeZone) })
                    : t('row.taskNoDue')
            }
        case 'task_reminder':
            return {
                title: t(task?.reminder === '2h' ? 'row.taskReminder2h' : 'row.taskReminder24h', { title }),
                content: null
            }
        default:
            return {
                title: t('row.taskUnassigned', { title }),
                content: t(task?.unassignedBy === 'left_server' ? 'row.taskLeftServer' : 'row.taskWithdrew', { name })
            }
    }
}

/** Whether an item is about a task (05 S-TASK-02 opens it). */
export const isTaskItem = (item: Notification) =>
    item.type === 'task_assigned' || item.type === 'task_reminder' || item.type === 'task_unassigned'

/** The words of an item (06 › Nội dung chữ): a mention, a reply, a task item. */
export function notificationText(item: Notification, sources: TextSources): NotificationText {
    const { t, places } = sources
    const name = actorName(item, t)
    const whom = item.type === 'mention' ? reached(item, sources.words) : null
    const { title, content } = isTaskItem(item)
        ? taskWords(item, sources)
        : {
              title:
                  item.type === 'reply'
                      ? t('row.reply', { name })
                      : whom
                        ? t('row.mentionWide', { name, whom })
                        : t('row.mention', { name }),
              content: contentOf(item, sources)
          }
    const place = item.serverId && item.channelId ? places.placeOf(item.serverId, item.channelId) : null
    return {
        title,
        content,
        source: place ? t('row.source', { channel: place.channelName, server: place.serverName }) : null,
        place: place ?? null
    }
}

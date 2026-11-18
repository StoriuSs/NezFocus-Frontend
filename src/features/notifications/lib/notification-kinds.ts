import type { Notification } from '../types'

/*
 * What kind an item is, with nothing else loaded: the badge's cache code
 * (`inbox-cache.ts`, not lazy) reads these, and the inbox's words stay in
 * its own chunk (D-193).
 */

/** Whether an item is about a task (05 S-TASK-02 opens it). */
export const isTaskItem = (item: Notification) =>
    item.type === 'task_assigned' || item.type === 'task_reminder' || item.type === 'task_unassigned'

/** Whether an item is about a server: one handed to one, or what was done to one there. */
export const isServerItem = (item: Notification) => item.type === 'owner_transferred' || item.type === 'moderation'

/** A kick or a ban: nothing to open, read once the inbox shows it (06 › Luật hộp thư, H1). */
export const isRemoval = (item: Notification) =>
    item.type === 'moderation' && (item.server?.action === 'kick' || item.server?.action === 'ban')

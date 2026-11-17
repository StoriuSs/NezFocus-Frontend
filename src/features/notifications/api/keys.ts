/** Query keys of the notifications feature. */
export const notificationKeys = {
    all: ['notifications'] as const,
    /** One's inbox, newest first, 30 a page, with the unread count (S-NOTI-01). */
    inbox: () => [...notificationKeys.all, 'inbox'] as const
}

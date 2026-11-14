/** Query keys of the realtime feature. */
export const realtimeKeys = {
    all: ['realtime'] as const,
    /** What others see of the signed-in person (REQ-AUTH-07): `ready`, then `presence.updated` about them. */
    ownPresence: () => [...realtimeKeys.all, 'own-presence'] as const
}

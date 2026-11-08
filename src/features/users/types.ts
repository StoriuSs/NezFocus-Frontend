import type { ApiModel } from '@/lib/api-types'

/**
 * GET /users/me. Optional fields are omitted by the API when unset — an
 * account that has not done "complete your account" has no username yet.
 */
export type UserProfile = ApiModel<'UserProfileResponseDto'>

export type UpdateProfileRequest = ApiModel<'UpdateProfileRequestDto'>

export type UsernameAvailability = ApiModel<'UsernameAvailabilityResponseDto'>

/** GET and PATCH /users/me/settings: the same in every browser (SRS 7.1, REQ-AUTH-08). */
export type UserSettings = ApiModel<'UserSettingsResponseDto'>

/** PATCH /users/me/settings: only what changed. */
export type SettingsChanges = ApiModel<'UpdateSettingsRequestDto'>

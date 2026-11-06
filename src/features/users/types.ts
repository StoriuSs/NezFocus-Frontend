import type { ApiModel } from '@/lib/api-types'

/**
 * GET /users/me. Optional fields are omitted by the API when unset — an
 * account that has not done "complete your account" has no username yet.
 */
export type UserProfile = ApiModel<'UserProfileResponseDto'>

export type UpdateProfileRequest = ApiModel<'UpdateProfileRequestDto'>

export type UsernameAvailability = ApiModel<'UsernameAvailabilityResponseDto'>

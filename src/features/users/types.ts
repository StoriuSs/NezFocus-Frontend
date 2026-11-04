import type { ApiModel } from '@/lib/api-types'

/**
 * GET /users/me. Optional fields are omitted by the API when unset — a user
 * who hasn't chosen a username has none.
 */
export type UserProfile = ApiModel<'UserProfileResponseDto'>

export type UpdateProfileRequest = ApiModel<'UpdateProfileRequestDto'>

export type UsernameAvailability = ApiModel<'UsernameAvailabilityResponseDto'>

export type SetUsernameRequest = ApiModel<'SetUsernameRequestDto'>

export type SetUsernameResponse = ApiModel<'SetUsernameResponseDto'>

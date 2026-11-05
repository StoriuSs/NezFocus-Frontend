import type { ApiModel } from '@/lib/api-types'

/** An access token, from sign-in, refresh, confirming an address or a reset. */
export type TokenResponse = ApiModel<'TokenResponseDto'>
export type AuthOptions = ApiModel<'AuthOptionsResponseDto'>
export type SignInMethods = ApiModel<'SignInMethodsResponseDto'>

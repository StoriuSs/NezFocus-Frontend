import type { ApiModel } from '@/lib/api-types'

/** An access token, from sign-in, refresh or a reset. */
export type TokenResponse = ApiModel<'TokenResponseDto'>
/** Signing in with the emailed code: the tokens, and what the page needs to know about the account. */
export type EmailCodeSignIn = ApiModel<'EmailCodeSignInResponseDto'>
/** The "complete your account" form, as POST /auth/complete-account takes it. */
export type AccountCompletion = ApiModel<'CompleteAccountRequestDto'>
export type AuthOptions = ApiModel<'AuthOptionsResponseDto'>
/** The signed-in devices (GET /auth/sessions). */
export type SessionList = ApiModel<'SessionListResponseDto'>
/** One signed-in device: its browser, system and IP as of its last use (D-138). */
export type SessionInfo = ApiModel<'SessionResponseDto'>

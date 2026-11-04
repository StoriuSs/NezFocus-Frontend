import type { CamelCasedPropertiesDeep } from 'type-fest'
import type { components } from './api-schema'

type Schemas = components['schemas']

/**
 * A request or response model from the backend's OpenAPI document, as the app
 * sees it: camelCased, like the axios client's case transform. Regenerate the
 * schema with `pnpm api:types` when the backend changes.
 *
 * @example type UserProfile = ApiModel<'UserProfileResponseDto'>
 */
export type ApiModel<Name extends keyof Schemas> = CamelCasedPropertiesDeep<Schemas[Name]>

/** Every success response: `{ meta, data }`. */
export interface ApiEnvelope<Data> {
    meta: ApiModel<'ApiResponseMetaDto'>
    data: Data
}

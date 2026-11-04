import camelcaseKeys from 'camelcase-keys'
import snakecaseKeys from 'snakecase-keys'

/**
 * The backend speaks snake_case and the app speaks camelCase. These helpers
 * convert only JSON-shaped values and pass everything else through untouched.
 *
 * Calling the libraries directly is not safe for arbitrary request/response
 * bodies: `snakecaseKeys` throws on FormData, strings and arrays of primitives,
 * and `camelcaseKeys` flattens a Blob or ArrayBuffer into `{}` — so a file
 * upload without an explicit Content-Type, or a `responseType: 'blob'`
 * download, would break.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

function convert(value: unknown, convertObject: (obj: Record<string, unknown>) => unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => convert(item, convertObject))
    if (isPlainObject(value)) return convertObject(value)
    return value
}

export function toSnakeCase<T = unknown>(value: unknown): T {
    return convert(value, (obj) => snakecaseKeys(obj, { deep: true })) as T
}

export function toCamelCase<T = unknown>(value: unknown): T {
    return convert(value, (obj) => camelcaseKeys(obj, { deep: true })) as T
}

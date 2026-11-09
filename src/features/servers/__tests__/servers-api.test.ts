import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ default: api }))

import { createServer, fetchServers, uploadServerIcon } from '../api/servers.api'

describe('servers API', () => {
    beforeEach(() => {
        api.get.mockReset()
        api.post.mockReset()
    })

    it('reads the list out of its envelope', async () => {
        api.get.mockResolvedValue({ data: { data: { servers: [{ id: 'ot' }] } } })
        await expect(fetchServers()).resolves.toEqual([{ id: 'ot' }])
        expect(api.get).toHaveBeenCalledWith('/servers')
    })

    it('creates with the intent key it is given', async () => {
        api.post.mockResolvedValue({ data: { data: { id: 'ot' } } })
        await expect(createServer({ name: 'Ôn thi', template: 'study' }, 'key-1')).resolves.toEqual({ id: 'ot' })
        expect(api.post).toHaveBeenCalledWith(
            '/servers',
            { name: 'Ôn thi', template: 'study' },
            { headers: { 'Idempotency-Key': 'key-1' } }
        )
    })

    it('sends the icon as a file field, leaving the content type to the browser', async () => {
        api.post.mockResolvedValue({ data: { data: { iconUrl: 'https://cdn.test/ot.webp' } } })
        const icon = new Blob(['jpeg'], { type: 'image/jpeg' })
        await expect(uploadServerIcon('ot', icon, 'key-2')).resolves.toBe('https://cdn.test/ot.webp')

        const [path, body, config] = api.post.mock.calls[0]!
        expect(path).toBe('/servers/ot/icon')
        expect((body as FormData).get('icon')).toBeInstanceOf(Blob)
        expect(config).toEqual({ headers: { 'Idempotency-Key': 'key-2' } })
    })
})

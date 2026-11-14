import { describe, expect, it } from 'vitest'
import { linkedServers, readAppLink, type LinkedServer } from '../lib/app-links'

const ORIGIN = 'https://nezfocus.app'
const SERVERS: LinkedServer[] = [
    {
        id: 'ot',
        name: 'Ôn thi Giải tích 2',
        channels: [
            { id: 'hoi-dap', name: 'hoi-dap', type: 'text' },
            { id: 'phong-hoc', name: 'Phòng học im lặng', type: 'voice' }
        ]
    },
    { id: 'nd', name: 'Nhóm đồ án Mobile', channels: [{ id: 'chung', name: 'chung', type: 'text' }] }
]
/** Message ids are UUIDs. */
const M1 = '0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'
const M2 = '0195a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c'
const read = (href: string, serverId = 'ot') => readAppLink(href, { origin: ORIGIN, servers: SERVERS, serverId })

describe('A link in a message, as the chat shows it (REQ-MSG-05, D-48, D-117)', () => {
    it('makes a link to a message of this server a chip "#channel › Message"', () => {
        expect(read(`https://nezfocus.app/channels/ot/hoi-dap/${M1}`)).toEqual({
            kind: 'message',
            to: `/channels/ot/hoi-dap/${M1}`,
            channel: 'hoi-dap'
        })
    })

    it('names the server of a message in another server', () => {
        expect(read(`https://nezfocus.app/channels/nd/chung/${M2}`)).toEqual({
            kind: 'message',
            to: `/channels/nd/chung/${M2}`,
            server: 'Nhóm đồ án Mobile',
            channel: 'chung'
        })
    })

    it('hides what they cannot see: a channel not theirs, a server they are not in, a room', () => {
        expect(read(`https://nezfocus.app/channels/ot/rieng-tu/${M1}`)).toEqual({ kind: 'hidden' })
        expect(read(`https://nezfocus.app/channels/cu/chung/${M1}`)).toEqual({ kind: 'hidden' })
        expect(read(`https://nezfocus.app/channels/ot/phong-hoc/${M1}`)).toEqual({ kind: 'hidden' })
    })

    it('opens any other page of the app in the app', () => {
        expect(read('https://nezfocus.app/channels/ot/hoi-dap')).toEqual({ kind: 'page', to: '/channels/ot/hoi-dap' })
        expect(read('https://nezfocus.app/study?tab=stats#top')).toEqual({ kind: 'page', to: '/study?tab=stats#top' })
    })

    it('leaves other sites alone: they open in a new tab', () => {
        expect(read(`https://tailieu.ptit.edu.vn/channels/ot/hoi-dap/${M1}`)).toBeNull()
        expect(read(`http://nezfocus.app/channels/ot/hoi-dap/${M1}`)).toBeNull()
    })

    it('never takes a path the router reads as another site for a page of the app', () => {
        expect(read('https://nezfocus.app//evil.example/x')).toBeNull()
        expect(read('https://nezfocus.app/\\evil.example/x')).toBeNull()
    })

    it('reads from the servers only what a link needs, the same text while that stays the same', () => {
        const server = {
            ...SERVERS[0]!,
            memberCount: 13,
            channels: [{ id: 'hoi-dap', name: 'hoi-dap', type: 'text' as const, permissions: '1' }]
        }
        const linked = linkedServers([server])
        expect(JSON.parse(linked)).toEqual([
            { id: 'ot', name: 'Ôn thi Giải tích 2', channels: [{ id: 'hoi-dap', name: 'hoi-dap', type: 'text' }] }
        ])
        const grown = { ...server, memberCount: 14 }
        expect(linkedServers([grown])).toBe(linked)
    })

    it('hides a link to a message whose id is not one', () => {
        expect(read('https://nezfocus.app/channels/ot/hoi-dap/m1')).toEqual({ kind: 'hidden' })
    })
})

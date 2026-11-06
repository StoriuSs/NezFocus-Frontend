/**
 * Mock data for the AppShell of M0: servers arrive in M1, channels in M2,
 * presence later (docs/notes/M0-plan.md, L4). Everything the shell shows of
 * them comes from here, so M1 replaces this one file with API queries.
 *
 * Names follow the shared sample data (docs/design/screens/README.md).
 */

import type { Presence } from '@/components/ui/presence-dot'

export interface MockChannel {
    id: string
    name: string
    kind: 'text' | 'study-room'
    /** Unread messages: the name turns bold. */
    unread?: boolean
    /** Unread messages that mention you: a count badge. */
    mentions?: number
}

export interface MockCategory {
    id: string
    name: string
    channels: MockChannel[]
}

export interface MockServer {
    id: string
    name: string
    /** The first letters of the first two words (C-05). */
    initials: string
    unread?: boolean
    mentions?: number
    categories: MockCategory[]
}

const textChannels = (unread: string[] = [], mentions: Record<string, number> = {}): MockChannel[] =>
    ['chao-mung', 'thong-bao', 'tai-lieu', 'hoi-dap', 'viec-nhom'].map((id) => ({
        id,
        name: id,
        kind: 'text',
        unread: unread.includes(id),
        mentions: mentions[id]
    }))

const studyRooms: MockChannel[] = [
    { id: 'phong-hoc-im-lang', name: 'Phòng học im lặng', kind: 'study-room' },
    { id: 'phong-thao-luan-nhom', name: 'Phòng thảo luận nhóm', kind: 'study-room' }
]

export const MOCK_SERVERS: MockServer[] = [
    {
        id: 'on-thi-giai-tich-2',
        name: 'Ôn thi Giải tích 2',
        initials: 'ÔT',
        categories: [
            { id: 'thong-tin', name: 'THÔNG TIN', channels: textChannels(['thong-bao'], { 'viec-nhom': 2 }) },
            { id: 'phong-hoc', name: 'PHÒNG HỌC', channels: studyRooms }
        ]
    },
    {
        id: 'nhom-do-an-mobile',
        name: 'Nhóm đồ án Mobile',
        initials: 'NĐ',
        unread: true,
        mentions: 2,
        categories: [
            { id: 'thong-tin', name: 'THÔNG TIN', channels: textChannels(['hoi-dap'], { 'thong-bao': 2 }) },
            { id: 'phong-hoc', name: 'PHÒNG HỌC', channels: studyRooms }
        ]
    },
    {
        id: 'clb-guitar-ptit',
        name: 'CLB Guitar PTIT',
        initials: 'CG',
        unread: true,
        categories: [{ id: 'thong-tin', name: 'THÔNG TIN', channels: textChannels(['chao-mung']) }]
    }
]

export function findServer(id: string | undefined): MockServer | undefined {
    return MOCK_SERVERS.find((server) => server.id === id)
}

export interface MockMember {
    name: string
    presence: Presence
    owner?: boolean
}

/** The members panel of every mock channel. You are not in it: you have no mock name. */
export const MOCK_MEMBERS: MockMember[] = [
    { name: 'Tuấn', presence: 'online' },
    { name: 'Bình', presence: 'online', owner: true },
    { name: 'Chi', presence: 'idle' },
    { name: 'Dũng', presence: 'dnd' },
    { name: 'Giang', presence: 'online' },
    { name: 'Minh', presence: 'offline' },
    { name: 'Nam', presence: 'offline' },
    { name: 'Phong', presence: 'offline' }
]

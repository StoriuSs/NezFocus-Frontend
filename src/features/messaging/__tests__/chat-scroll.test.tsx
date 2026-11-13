import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useChatScroll } from '../hooks/useChatScroll'
import { chatRows } from '../lib/chat-rows'
import type { ChatMessage, Message, OutgoingMessage } from '../types'

// jsdom lays nothing out: the list's sizes come from here.
const metrics = { height: 0, client: 400, top: 0 }
const saved = {
    scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
    scrollTop: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
}

const person = { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null }
/** Message `n`, one a minute from 20:00 the same day, so all share one date line. */
const message = (n: number, who = person): Message => ({
    id: `m${String(n).padStart(3, '0')}`,
    channelId: 'hoi-dap',
    type: 'regular',
    author: who,
    content: `Tin ${n}`,
    systemEvent: null,
    systemData: null,
    replyTo: null,
    editedAt: null,
    createdAt: new Date(Date.UTC(2026, 9, 18, 13, n)).toISOString()
})
const outgoing = (nonce: string): OutgoingMessage => ({
    nonce,
    channelId: 'hoi-dap',
    content: 'Của mình',
    author: { ...person, id: 'an' },
    createdAt: new Date(Date.UTC(2026, 9, 18, 14, 0)).toISOString(),
    state: 'sending'
})
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => message(from + i))

const older = { has: true, loading: false, load: () => undefined }

function Harness({ messages, loading = false }: { messages: ChatMessage[]; loading?: boolean }) {
    const { list, onScroll, away, newCount } = useChatScroll(chatRows(messages, 'Asia/Ho_Chi_Minh'), {
        ...older,
        loading
    })
    return (
        <div ref={list} onScroll={onScroll} data-testid='list'>
            <output>{`${away ? 'away' : 'bottom'} ${newCount}`}</output>
        </div>
    )
}

const scrollTo = (top: number) => {
    metrics.top = top
    fireEvent.scroll(screen.getByTestId('list'))
}

describe('How the message list scrolls (C-10 › Cuộn)', () => {
    beforeEach(() => {
        Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => metrics.height })
        Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => metrics.client })
        Object.defineProperty(Element.prototype, 'scrollTop', {
            configurable: true,
            get: () => metrics.top,
            set: (value: number) => (metrics.top = value)
        })
        Object.assign(metrics, { height: 1000, client: 400, top: 0 })
    })
    afterEach(() => {
        for (const [name, descriptor] of Object.entries(saved)) {
            if (descriptor) Object.defineProperty(Element.prototype, name, descriptor)
        }
    })

    it('opens at the bottom', () => {
        render(<Harness messages={range(51, 100)} />)
        expect(metrics.top).toBe(1000)
        expect(screen.getByRole('status')).toHaveTextContent('bottom 0')
    })

    it('keeps the message being read in place when older ones of the same day appear above', () => {
        const view = render(<Harness messages={range(51, 100)} />)
        scrollTo(100)

        metrics.height = 1080
        view.rerender(<Harness messages={range(51, 100)} loading />)
        expect(metrics.top).toBe(180)

        metrics.height = 1700
        view.rerender(<Harness messages={range(1, 100)} />)
        expect(metrics.top).toBe(800)
    })

    it('stays still when someone writes while older messages are read, and counts them', () => {
        const view = render(<Harness messages={range(51, 100)} />)
        scrollTo(200)

        metrics.height = 1060
        view.rerender(<Harness messages={[...range(51, 100), message(101), message(102)]} />)

        expect(metrics.top).toBe(200)
        expect(screen.getByRole('status')).toHaveTextContent('away 2')
    })

    it("counts what others wrote though one's own unsent message stays last", () => {
        const view = render(<Harness messages={[...range(51, 100), outgoing('n1')]} />)
        scrollTo(200)

        view.rerender(<Harness messages={[...range(51, 101), outgoing('n1')]} />)

        expect(screen.getByRole('status')).toHaveTextContent('away 1')
    })

    it('goes to the bottom when one sends, wherever one was reading', () => {
        const view = render(<Harness messages={range(51, 100)} />)
        scrollTo(200)

        metrics.height = 1040
        view.rerender(<Harness messages={[...range(51, 100), outgoing('n1')]} />)

        expect(metrics.top).toBe(1040)
        expect(screen.getByRole('status')).toHaveTextContent('bottom 0')
    })
})

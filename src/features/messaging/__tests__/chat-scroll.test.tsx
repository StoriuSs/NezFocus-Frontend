import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useChatScroll } from '../hooks/useChatScroll'
import { chatRows } from '../lib/chat-rows'
import type { ChatMessage, Message, OutgoingMessage } from '../types'

// jsdom lays nothing out: the list's sizes come from here.
const metrics = { height: 0, client: 400, top: 0 }
const saved = {
    scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
    scrollTop: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop'),
    offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')
}
/** Where the message a link opens sits in the list. */
const TARGET = { key: 'm010', offsetTop: 600 }

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
    systemUser: null,
    pinned: false,
    reactions: [],
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

const none = { has: false, loading: false, load: () => undefined }

function Harness({
    messages,
    loading = false,
    newer = none,
    target
}: {
    messages: ChatMessage[]
    loading?: boolean
    newer?: typeof none
    target?: { key: string | null; token: string }
}) {
    const rows = chatRows(messages, 'Asia/Ho_Chi_Minh')
    const { list, onScroll, away, newCount } = useChatScroll(rows, { ...older, loading }, { newer, target })
    return (
        <div ref={list} onScroll={onScroll} data-testid='list'>
            <output>{`${away ? 'away' : 'bottom'} ${newCount}`}</output>
            {rows.map((row) => (
                <div key={row.key} data-row-key={row.key} />
            ))}
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
        Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
            configurable: true,
            get(this: HTMLElement) {
                return this.dataset.rowKey === TARGET.key ? TARGET.offsetTop : 0
            }
        })
        Object.assign(metrics, { height: 1000, client: 400, top: 0 })
    })
    afterEach(() => {
        for (const [name, descriptor] of Object.entries(saved)) {
            if (descriptor)
                Object.defineProperty(
                    name === 'offsetTop' ? HTMLElement.prototype : Element.prototype,
                    name,
                    descriptor
                )
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

    it('opens at the message of a link, a third of the way down the list (D-48)', () => {
        render(<Harness messages={range(1, 50)} target={{ key: TARGET.key, token: 't1' }} />)

        expect(metrics.top).toBe(TARGET.offsetTop - Math.round(metrics.client / 3))
        expect(screen.getByRole('status')).toHaveTextContent('away 0')
    })

    it('goes back to it each time the link is opened again', () => {
        const view = render(<Harness messages={range(1, 50)} target={{ key: TARGET.key, token: 't1' }} />)
        scrollTo(0)

        view.rerender(<Harness messages={range(1, 50)} target={{ key: TARGET.key, token: 't1' }} />)
        expect(metrics.top).toBe(0)
        view.rerender(<Harness messages={range(1, 50)} target={{ key: TARGET.key, token: 't2' }} />)
        expect(metrics.top).toBe(TARGET.offsetTop - Math.round(metrics.client / 3))
    })

    it('waits for the message to be in the list', () => {
        const view = render(<Harness messages={range(51, 100)} target={{ key: TARGET.key, token: 't1' }} />)
        expect(metrics.top).toBe(1000)

        view.rerender(<Harness messages={range(1, 50)} target={{ key: TARGET.key, token: 't1' }} />)
        expect(metrics.top).toBe(TARGET.offsetTop - Math.round(metrics.client / 3))
    })

    it('goes to the bottom once a history that stopped short has its newest messages back', () => {
        const stopsShort = { has: true, loading: false, load: () => undefined }
        const view = render(<Harness messages={range(1, 50)} newer={stopsShort} />)
        scrollTo(200)

        view.rerender(<Harness messages={range(1, 50)} newer={stopsShort} target={{ key: null, token: 't1' }} />)
        expect(metrics.top).toBe(200)

        metrics.height = 1500
        view.rerender(<Harness messages={range(51, 100)} target={{ key: null, token: 't1' }} />)
        expect(metrics.top).toBe(1500)
        expect(screen.getByRole('status')).toHaveTextContent('bottom 0')
    })

    it('opens a history that stops short away from the bottom, so ↓ offers the newest', () => {
        render(<Harness messages={range(1, 50)} newer={{ has: true, loading: false, load: () => undefined }} />)
        expect(screen.getByRole('status')).toHaveTextContent('away 0')
    })

    it('counts no older messages read on scrolling down as new ones', () => {
        const stopsShort = { has: true, loading: false, load: () => undefined }
        const view = render(<Harness messages={range(1, 50)} newer={stopsShort} />)
        scrollTo(200)

        view.rerender(<Harness messages={range(1, 100)} newer={stopsShort} />)
        expect(screen.getByRole('status')).toHaveTextContent('away 0')
        view.rerender(<Harness messages={range(1, 150)} />)
        scrollTo(300)
        expect(screen.getByRole('status')).toHaveTextContent('away 0')
        view.rerender(<Harness messages={range(1, 152)} />)
        expect(screen.getByRole('status')).toHaveTextContent('away 2')
    })

    it('reads newer messages near the end of a history that stops short, without following them down', () => {
        const load = vi.fn()
        const newer = { has: true, loading: false, load }
        const view = render(<Harness messages={range(1, 50)} newer={newer} />)

        scrollTo(500)
        expect(load).toHaveBeenCalled()
        expect(screen.getByRole('status')).toHaveTextContent('away 0')

        metrics.height = 2000
        view.rerender(<Harness messages={range(1, 100)} newer={{ ...newer, has: false }} />)
        expect(metrics.top).toBe(500)
    })
})

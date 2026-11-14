import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import '@/i18n'
import '@/i18n/messaging'

const sendRealtimeSignal = vi.fn()
vi.mock('@/features/realtime/lib/signals', () => ({ sendRealtimeSignal }))

const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { useTyping, useReportTyping, TYPING_SHOWN_MS, TYPING_EVERY_MS } = await import('../hooks/useTyping')
const { TypingLine } = await import('../components/TypingLine')

const person = (id: string, displayName: string | null) => ({ id, username: `${id}.tran`, displayName })
const typing = (id: string, displayName: string | null = null, channelId = 'hoi-dap') => {
    act(() => emitRealtimeEvent('typing.started', { channelId, user: person(id, displayName) }))
}
const wait = (ms: number) => {
    act(() => {
        vi.advanceTimersByTime(ms)
    })
}

describe('Who is typing (REQ-MSG-06)', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('shows someone typing in this channel for 10 seconds, but never oneself, nor another channel', () => {
        const { result } = renderHook(() => useTyping('hoi-dap', 'an'))

        typing('binh', 'Bình')
        typing('an', 'An')
        typing('chi', 'Chi', 'tai-lieu')
        expect(result.current).toEqual(['Bình'])

        wait(TYPING_SHOWN_MS)
        expect(result.current).toEqual([])
    })

    it('keeps them on while they keep typing, the first to start first', () => {
        const { result } = renderHook(() => useTyping('hoi-dap', 'an'))
        typing('binh', 'Bình')
        wait(8000)
        typing('dung')
        typing('binh', 'Bình')
        wait(8000)
        expect(result.current).toEqual(['Bình', 'dung.tran'])
    })

    it('takes them off as soon as their message comes', () => {
        const { result } = renderHook(() => useTyping('hoi-dap', 'an'))
        typing('binh', 'Bình')
        act(() =>
            emitRealtimeEvent('message.created', { message: { channelId: 'hoi-dap', author: person('binh', 'Bình') } })
        )
        expect(result.current).toEqual([])
    })
})

describe('The typing line (C-10)', () => {
    it('names one or two people, and says several for three or more', () => {
        const { rerender } = render(<TypingLine names={['Bình']} />)
        expect(screen.getByText('Bình is typing…')).toBeInTheDocument()
        rerender(<TypingLine names={['Bình', 'Dũng']} />)
        expect(screen.getByText('Bình and Dũng are typing…')).toBeInTheDocument()
        rerender(<TypingLine names={['Bình', 'Dũng', 'Chi']} />)
        expect(screen.getByText('Several people are typing…')).toBeInTheDocument()
    })

    it('keeps its place, 24 high, with no one typing: the list never jumps', () => {
        const { container } = render(<TypingLine names={[]} />)
        expect(container.firstElementChild).toHaveClass('h-6')
        expect(container.firstElementChild).toBeEmptyDOMElement()
    })
})

describe('Telling others one is typing (REQ-MSG-06)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        sendRealtimeSignal.mockClear()
    })
    afterEach(() => vi.useRealTimers())

    it('tells at most once in 8 seconds, and at once again after the box was emptied (sent)', () => {
        const { result } = renderHook(() => useReportTyping('hoi-dap'))

        act(() => result.current('C'))
        act(() => result.current('Ch'))
        expect(sendRealtimeSignal).toHaveBeenCalledTimes(1)
        expect(sendRealtimeSignal).toHaveBeenCalledWith('typing.start', { channelId: 'hoi-dap' })

        wait(TYPING_EVERY_MS)
        act(() => result.current('Chà'))
        expect(sendRealtimeSignal).toHaveBeenCalledTimes(2)

        act(() => result.current(''))
        act(() => result.current('M'))
        expect(sendRealtimeSignal).toHaveBeenCalledTimes(3)
    })

    it('tells nothing while invisible: typing would show they are there (D-176)', () => {
        const { result } = renderHook(() => useReportTyping('hoi-dap', true))
        act(() => result.current('Chào'))
        expect(sendRealtimeSignal).not.toHaveBeenCalled()
    })

    it('tells nothing for a box only of spaces', () => {
        const { result } = renderHook(() => useReportTyping('hoi-dap'))
        act(() => result.current('   '))
        expect(sendRealtimeSignal).not.toHaveBeenCalled()
    })
})

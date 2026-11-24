import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expectNoA11yViolations } from '@/test/a11y'
import { tabPanelProps, Tabs } from '../tabs'

type Tab = 'online' | 'all' | 'pending'

function Page({ start = 'online' }: { start?: Tab }) {
    const [tab, setTab] = useState<Tab>(start)
    return (
        <>
            <Tabs
                id='friends'
                aria-label='Bạn bè'
                value={tab}
                onValueChange={setTab}
                tabs={[
                    { value: 'online', label: 'Trực tuyến' },
                    { value: 'all', label: 'Tất cả' },
                    { value: 'pending', label: 'Đang chờ', badge: 2, badgeLabel: '2 lời mời đến' }
                ]}
            />
            <div {...tabPanelProps('friends', tab)}>Phần {tab}</div>
        </>
    )
}

describe('Tabs (C-26b)', () => {
    it('shows the chosen tab’s panel, labelled by it, and says a Badge in words', async () => {
        render(<Page />)

        expect(screen.getByRole('tab', { name: 'Trực tuyến' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tabpanel', { name: 'Trực tuyến' })).toHaveTextContent('Phần online')
        expect(screen.getByRole('tab', { name: 'Đang chờ, 2 lời mời đến' })).toHaveAttribute('tabindex', '-1')
        await expectNoA11yViolations()
    })

    it('chooses with a click, with ← → going round, and Home / End', async () => {
        const user = userEvent.setup()
        render(<Page />)

        await user.click(screen.getByRole('tab', { name: 'Tất cả' }))
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Phần all')

        await user.keyboard('{ArrowRight}')
        expect(screen.getByRole('tab', { name: /Đang chờ/ })).toHaveFocus()
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Phần pending')

        await user.keyboard('{ArrowRight}')
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Phần online')

        await user.keyboard('{ArrowLeft}')
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Phần pending')

        await user.keyboard('{Home}')
        expect(screen.getByRole('tab', { name: 'Trực tuyến' })).toHaveFocus()
        await user.keyboard('{End}')
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Phần pending')
    })

    it('leaves the Badge out at zero', () => {
        render(
            <Tabs
                id='x'
                aria-label='X'
                value='a'
                onValueChange={() => undefined}
                tabs={[{ value: 'a', label: 'Đang chờ', badge: 0, badgeLabel: '0 lời mời' }]}
            />
        )
        expect(screen.getByRole('tab', { name: 'Đang chờ' })).toBeInTheDocument()
    })
})

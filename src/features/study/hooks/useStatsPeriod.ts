import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { serverNow } from '@/lib/server-clock'
import { accountTimeZone } from '@/lib/time-zones'
import { periodFromSearch, searchOf, type StatsPeriod } from '../lib/periods'
import { dateKeyAt } from '../lib/week'

/**
 * The period the Stats page shows, from its URL (08 › Quy ước › URL), and the
 * way to another: each a new history entry, so Back goes to the period seen
 * before. With no period on the URL, this week as the page was opened (each
 * visit anew): past midnight into a new week the page stays on the one just
 * gone (08
 * S-STUDY-03 › Tương tác, D-235).
 */
export function useStatsPeriod(): { period: StatsPeriod; show: (period: StatsPeriod) => void } {
    const [search] = useSearchParams()
    const navigate = useNavigate()
    // Each visit takes its day once (a click on "Thống kê", Back): staying on, the page keeps it.
    const { key } = useLocation()
    const [opened, setOpened] = useState(() => ({ key, day: dateKeyAt(serverNow(), accountTimeZone()) }))
    if (opened.key !== key) setOpened({ key, day: dateKeyAt(serverNow(), accountTimeZone()) })
    const period = useMemo(() => periodFromSearch(search, opened.day), [search, opened.day])
    return { period, show: (next) => void navigate({ search: searchOf(next) }) }
}

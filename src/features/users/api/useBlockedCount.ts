import { useQuery } from '@tanstack/react-query'
import type { BlockList } from '../lib/block-list'

const countBlocked = (entries: readonly { type: string }[]) =>
    entries.filter((entry) => entry.type === 'blocked').length

/**
 * How many people one blocked (S-ME-05 "Danh sách chặn · N người"), read
 * from the social feature's list, which the app reads as it opens and the
 * socket keeps live; undefined until it is read.
 */
export function useBlockedCount({ query }: BlockList): number | undefined {
    return useQuery({ ...query, select: countBlocked }).data
}

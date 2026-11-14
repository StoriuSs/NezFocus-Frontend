/** The picker's columns (C-12 EmojiPicker, frame `eLFUv`). */
export const GRID_COLUMNS = 8

/** An emoji in the picker: its group's place, and its place in that group. */
export interface GridPosition {
    group: number
    index: number
}

/**
 * Where an arrow key goes in the picker's grid: groups one after another,
 * each starting a new row of `columns`. ← / → go one emoji back or on,
 * across groups; ↑ / ↓ go one row up or down in the same column (onto the
 * last emoji of a shorter row), into the group before or after; ↑ from the
 * first row goes back to the search box. Any other key is not the grid's
 * (null). The edges stay where they are.
 */
export function moveInGrid(
    sizes: number[],
    at: GridPosition,
    key: string,
    columns = GRID_COLUMNS
): GridPosition | 'search' | null {
    const { group, index } = at
    const size = sizes[group] ?? 0
    const column = index % columns
    const row = Math.floor(index / columns)
    const lastRow = Math.floor((size - 1) / columns)
    const before = group > 0 ? sizes[group - 1]! : 0
    const after = group < sizes.length - 1 ? sizes[group + 1]! : 0

    switch (key) {
        case 'ArrowRight':
            if (index < size - 1) return { group, index: index + 1 }
            return after ? { group: group + 1, index: 0 } : at
        case 'ArrowLeft':
            if (index > 0) return { group, index: index - 1 }
            return before ? { group: group - 1, index: before - 1 } : at
        case 'ArrowDown':
            if (row < lastRow) return { group, index: Math.min(index + columns, size - 1) }
            return after ? { group: group + 1, index: Math.min(column, after - 1) } : at
        case 'ArrowUp': {
            if (row > 0) return { group, index: index - columns }
            if (!before) return 'search'
            const top = Math.floor((before - 1) / columns) * columns
            return { group: group - 1, index: Math.min(top + column, before - 1) }
        }
        default:
            return null
    }
}

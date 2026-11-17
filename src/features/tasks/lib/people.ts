/** Me first, then in the order given: when each was given the task (C-28, 05 Q4). */
export function meFirst<T extends { id: string }>(people: readonly T[], me: string | undefined): T[] {
    const mine = people.filter((person) => person.id === me)
    return [...mine, ...people.filter((person) => person.id !== me)]
}

/** The name shown for someone: their display name, else their username (an account being deleted has neither, D-182). */
export const nameOf = (person: { displayName: string | null; username: string | null }, deleted: string) =>
    person.displayName ?? person.username ?? deleted

/** Whether `me` may change the status of a task (REQ-TASK-02): its creator, someone on it, or MANAGE_TASKS. */
export function mayChangeStatus(
    task: { creator: { id: string }; assignees: ReadonlyArray<{ id: string }> },
    me: string | undefined,
    powers: { manage: boolean; timedOut: boolean }
): boolean {
    if (powers.timedOut || me === undefined) return false
    return powers.manage || task.creator.id === me || task.assignees.some((person) => person.id === me)
}

/** Whether `me` may edit or delete a task (REQ-TASK-02): its creator, or MANAGE_TASKS. */
export function mayEdit(
    task: { creator: { id: string } },
    me: string | undefined,
    powers: { manage: boolean; timedOut: boolean }
): boolean {
    if (powers.timedOut || me === undefined) return false
    return powers.manage || task.creator.id === me
}

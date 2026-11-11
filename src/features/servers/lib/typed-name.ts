/**
 * Whether a name typed to confirm a delete matches (C-14 `type-name`): case,
 * accents and spaces at either end left out, đ as d, so "Viec-Nhom" confirms
 * "việc-nhóm". The backend compares the same way (domain/membership.ts ›
 * typedNameMatches).
 */
export const sameTyped = (typed: string, name: string) => {
    const fold = (text: string) =>
        text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().trim()
    return fold(typed) === fold(name)
}

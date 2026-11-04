import axe from 'axe-core'

/**
 * Fails the test when axe-core finds a critical or serious WCAG 2.1 A / AA
 * problem in `container`: a button with no name, an input with no label, a
 * broken ARIA attribute (CONSTRAINTS.md, accessibility). Every new page and
 * AppShell part gets one such test.
 *
 * Colour contrast is switched off: jsdom computes no layout or colours, so
 * axe could only guess. Contrast is held by DESIGN.md's token table and the
 * manual test of each milestone instead.
 */
export async function expectNoA11yViolations(container: Element = document.body) {
    const results = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        rules: { 'color-contrast': { enabled: false } },
        resultTypes: ['violations']
    })
    const blocking = results.violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .map((v) => `  ${v.id} (${v.impact}): ${v.help}, at ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)
    // A thrown list rather than expect(...).toEqual([]), which would print
    // "Array(1)" and hide which rule failed.
    if (blocking.length) {
        throw new Error(`Critical or serious accessibility problems:\n${blocking.join('\n')}`)
    }
}

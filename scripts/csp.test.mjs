// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { cspTemplate, PLACEHOLDERS } from './csp.mjs'

const directive = (policy, name) =>
    policy
        .split('; ')
        .find((d) => d.startsWith(`${name} `))
        ?.split(' ')
        .slice(1)

const sha256 = (body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`

// cspTemplate is what the image build ships (Dockerfile: node scripts/csp.mjs dist).
describe('the Content-Security-Policy template', () => {
    it('allows the inline scripts of every page by hash, never unsafe-inline', () => {
        const policy = cspTemplate([
            '<head><script>var a = 1</script><script type="module" src="/assets/index.js"></script></head>',
            '<body><script>parent.postMessage(1)</script></body>'
        ])
        expect(directive(policy, 'script-src')).toEqual([
            "'self'",
            sha256('var a = 1'),
            sha256('parent.postMessage(1)')
        ])
        expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/)
        expect(directive(policy, 'object-src')).toEqual(["'none'"])
        expect(directive(policy, 'frame-src')).toEqual(["'none'"])
    })

    it('hashes a script as the browser sees it, with CRLF line endings turned into LF', () => {
        // A Windows checkout produced hashes no browser matched, and the page's own scripts were blocked.
        const policy = cspTemplate(['<script>\r\n  go()\r\n</script>'])
        expect(directive(policy, 'script-src')).toEqual(["'self'", sha256('\n  go()\n')])
    })

    it('leaves every origin the server knows as a placeholder, and holds no address of its own', () => {
        const policy = cspTemplate(['<head><script>var a = 1</script></head>'])
        expect(directive(policy, 'connect-src')).toEqual(["'self'", PLACEHOLDERS.api, PLACEHOLDERS.errorTracking])
        expect(directive(policy, 'img-src')).toContain(PLACEHOLDERS.images)
        expect(policy).not.toMatch(/https?:\/\/(?!__)/)
    })
})

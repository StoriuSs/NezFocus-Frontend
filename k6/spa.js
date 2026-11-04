import http from 'k6/http'
import { check, fail } from 'k6'

/**
 * Load test for the built site.
 *
 * Be clear about what this measures. The container is nginx serving files that
 * were built once; it does not touch a database, and nginx will serve static
 * files faster than most networks can carry them. So this is not a test of
 * "can React handle the traffic" — there is no React running on the server.
 *
 * What it *is* good for:
 *
 * - **Cache headers, under real traffic.** If `index.html` or `/config.js`
 *   were cached, users would keep running an old build and pointing at the old
 *   API long after a deploy. If hashed assets were *not* cached, every visit
 *   would re-download the whole bundle. Both are checked on every request
 *   here, not once in a unit test.
 * - **Deep links.** `/profile` has to return the app, not a 404. A missing
 *   `try_files` line breaks every refresh and every shared link.
 * - **Headroom.** Seeing the server answer a few hundred requests a second
 *   without breaking a sweat is a useful thing to have seen before launch.
 *
 * The API is where load actually bites. Its scripts are in the backend
 * repository — see docs/load-testing.md.
 *
 *     k6 run -e APP_URL=https://app.example.com k6/spa.js
 *     RATE=200 DURATION=2m k6 run k6/spa.js
 */

const APP_URL = (__ENV.APP_URL || 'http://localhost:8081').replace(/\/+$/, '')
const RATE = Number(__ENV.RATE || 50)
const DURATION = __ENV.DURATION || '1m'
const BUDGET_MS = Number(__ENV.BUDGET_MS || 200)

export const options = {
    scenarios: {
        browsing: {
            executor: 'constant-arrival-rate',
            rate: RATE,
            timeUnit: '1s',
            duration: DURATION,
            preAllocatedVUs: Math.max(10, RATE),
            maxVUs: Math.max(50, RATE * 4)
        }
    },
    thresholds: {
        // Static files. Nothing here has any business failing.
        http_req_failed: ['rate==0.00'],
        checks: ['rate==1.00'],
        http_req_duration: [`p(95)<${BUDGET_MS}`]
    }
}

/**
 * Runs once before the load starts. Loads the page and finds a real hashed
 * asset in it, so the test requests the file this build actually references
 * rather than a name hard-coded here that changes on every build.
 */
export function setup() {
    const response = http.get(`${APP_URL}/`)
    if (response.status !== 200) {
        fail(`${APP_URL}/ answered ${response.status}. Is the site running at that address?`)
    }

    const match = /["'](\/assets\/[^"']+\.js)["']/.exec(response.body)
    if (!match) {
        fail('No hashed asset found in index.html — is this a production build?')
    }
    return { asset: match[1] }
}

export default function (data) {
    const roll = Math.random()

    if (roll < 0.5) {
        // The page itself. Must never be cached, or a deploy reaches nobody.
        const page = http.get(`${APP_URL}/`, { tags: { name: 'GET /' } })
        check(page, {
            'the page loads': (r) => r.status === 200,
            'the page is not cached': (r) => /no-cache|no-store/.test(r.headers['Cache-Control'] || '')
        })
    } else if (roll < 0.7) {
        // Written at container start from the environment, so it must not be
        // cached either: a stale copy points the app at the wrong API.
        const config = http.get(`${APP_URL}/config.js`, { tags: { name: 'GET /config.js' } })
        check(config, {
            'the runtime config loads': (r) => r.status === 200,
            'the runtime config is not cached': (r) => /no-store/.test(r.headers['Cache-Control'] || ''),
            'the runtime config sets the API URL': (r) => r.body.includes('VITE_API_URL')
        })
    } else if (roll < 0.9) {
        // Its name contains a hash of its contents, so it can be cached for a
        // year: a new build produces a new name.
        const asset = http.get(`${APP_URL}${data.asset}`, { tags: { name: 'GET /assets/*' } })
        check(asset, {
            'the asset loads': (r) => r.status === 200,
            'the asset is cached for a long time': (r) => /immutable/.test(r.headers['Cache-Control'] || '')
        })
    } else {
        // Someone opening a link straight to an inner page, or refreshing one.
        // The server has no such file; it has to answer with the app.
        const deep = http.get(`${APP_URL}/profile`, { tags: { name: 'GET /profile (deep link)' } })
        check(deep, {
            'a deep link returns the app': (r) => r.status === 200 && r.body.includes('<div id="root"'),
            'a deep link is not cached': (r) => /no-cache|no-store/.test(r.headers['Cache-Control'] || '')
        })
    }
}

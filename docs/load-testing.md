# Load testing

There is a load-test script here, in [`k6/spa.js`](../k6/spa.js), but the first
thing to say about it is what it does **not** prove.

The production container is nginx serving files that were built once. No React
runs on the server, nothing touches a database, and nginx will serve a static
file faster than most networks can carry it — the run below answered 100
requests a second with a 95th-percentile response time of 1.1 milliseconds, on
a laptop, and was nowhere near working hard. **If you are worried about whether
your system can take the traffic, the API is what to test**, and its scripts
and guide live in the backend repository under `docs/load-testing.md`.

What this script is genuinely useful for is checking, under real traffic, the
four things about serving a single-page app that are easy to get wrong and
expensive to get wrong:

| Check | What breaks without it |
| --- | --- |
| `index.html` is **not** cached | A deploy reaches nobody: browsers keep running the old build. |
| `/config.js` is **not** cached | Worse — the old build keeps pointing at the old API. |
| `/assets/*` **is** cached, `immutable` | Every visit re-downloads the whole bundle. Slow for users, expensive for you. |
| `/profile` returns the app, not 404 | Refreshing an inner page, or opening a shared link, shows an error page. |

Those come from [`nginx.conf`](../nginx.conf) and are easy to break while
changing something nearby. A unit test could check them once; this checks them
on every one of a few thousand requests, against the real image.

## Running it

k6 is a single binary — `winget install --id GrafanaLabs.k6` on Windows,
`brew install k6` on macOS, and Grafana's apt or yum repository on Linux
([install page](https://grafana.com/docs/k6/latest/set-up/install-k6/)). Or run
it in a container and install nothing:

```bash
docker run --rm -v "$PWD/k6:/k6:ro" -e APP_URL=http://host.docker.internal:8081 \
  grafana/k6 run /k6/spa.js
```

Against a site you have running:

```bash
pnpm load:spa                                       # pnpm docker:prod on this machine
APP_URL=https://app.example.com pnpm load:spa       # a deployed site
RATE=300 DURATION=2m pnpm load:spa                  # harder, for longer
```

The script's default, `http://localhost:8081`, is where `pnpm docker:prod`
publishes the container (`FRONTEND_PORT`). For an image started with
`docker run -p 127.0.0.1:8080:8080 <image>`, set `APP_URL=http://localhost:8080`
(in PowerShell, first: `$env:APP_URL = 'http://localhost:8080'`).

| Variable | Default | What it does |
| --- | --- | --- |
| `APP_URL` | `http://localhost:8081` | Where the site is. |
| `RATE` | `50` | Requests per second. Held constant for the whole run. |
| `DURATION` | `1m` | How long to hold it. |
| `BUDGET_MS` | `200` | The 95th-percentile response time allowed. |

It has to be a **production build** — `pnpm docker:prod`, or the image CI
publishes. The Vite dev server has no hashed assets and no cache headers, so
the script stops at startup and says so.

## Reading the result

```
    checks_succeeded...: 100.00% 6575 out of 6575

    ✓ the page loads
    ✓ the page is not cached
    ✓ the runtime config loads
    ✓ the runtime config is not cached
    ✓ the runtime config sets the API URL
    ✓ the asset loads
    ✓ the asset is cached for a long time
    ✓ a deep link returns the app
    ✓ a deep link is not cached

    http_req_duration..: avg=605µs p(95)=1.13ms
    http_req_failed....: 0.00%  0 out of 3002
```

Anything other than 100% is a real finding, and the failing line names which of
the four things above broke. k6 exits non-zero in that case, so it can go in a
release checklist.

`http_req_duration` measured from your machine includes the network between
you and the server, which for a deployed site is most of the number. Testing
Singapore from Europe adds about 180ms to every request and says nothing about
the server.

## What to test instead

- **The API**, in the backend repository. That is where the database, the
  cache, the rate limiter and the image processing are, and where load
  actually costs something.
- **Real browser behaviour** — the [end-to-end tests](./e2e-testing.md) drive a
  real browser through sign-up, sign-in, two-step sign-in, an avatar upload
  and deleting the account. That answers "does it work", which a load test
  never does.
- **Bundle size**, which affects every first visit more than server speed does.
  `pnpm build` prints the chunk sizes.

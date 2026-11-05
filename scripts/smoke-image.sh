#!/usr/bin/env bash
# Starts a production image and checks what a server relies on: nginx answers,
# every page carries the Content-Security-Policy, a deep link gets the app
# (not a 404), and no sourcemap is served. CI runs it on every image before
# publishing it.
#
#   scripts/smoke-image.sh <image>
set -euo pipefail

IMAGE=${1:?usage: scripts/smoke-image.sh <image>}
NAME=smoke-$$
TIMEOUT=${SMOKE_TIMEOUT:-60}
BASE=http://127.0.0.1:8080

cleanup() { docker rm -f "$NAME" "$NAME-bad-dsn" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() {
	echo "✗ $*" >&2
	docker logs "$NAME" 2>&1 | tail -20 >&2
	exit 1
}
# Response headers of a path, fetched inside the container (BusyBox wget).
headers() { docker exec "$NAME" wget -S -q -O /dev/null "$BASE$1" 2>&1 || true; }

# The setting a server would give it: the image holds no addresses, and
# refuses to start without this (nginx/40-runtime-config.sh).
API_URL=https://api.smoke.example/api/v1
DSN=https://publickey@o1.ingest.smoke.example/2
docker run -d --name "$NAME" \
	-e VITE_API_URL="$API_URL" \
	-e VITE_SENTRY_DSN="$DSN" \
	"$IMAGE" >/dev/null

for ((waited = 0; ; waited += 1)); do
	[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = true ] || fail "nginx exited"
	docker exec "$NAME" wget -q -O /dev/null "$BASE/" 2>/dev/null && break
	((waited < TIMEOUT)) || fail "no answer on $BASE/ within ${TIMEOUT}s"
	sleep 1
done

headers / | grep -qi 'Content-Security-Policy:' || fail "/ has no Content-Security-Policy header"

deep=$(docker exec "$NAME" wget -q -O - "$BASE/some/deep/link" 2>/dev/null) || fail "a deep link did not answer 200"
grep -q '<div id="root">' <<<"$deep" || fail "a deep link did not get index.html"
headers /some/deep/link | grep -qi 'Content-Security-Policy:' || fail "a deep link has no Content-Security-Policy header"

maps=$(docker exec "$NAME" find /usr/share/nginx/html -name '*.map')
[ -z "$maps" ] || fail "sourcemaps are served: $maps"

# The settings this container was started with reach the browser, and the
# policy names the same addresses (nginx/40-runtime-config.sh).
config=$(docker exec "$NAME" wget -q -O - "$BASE/config.js" 2>/dev/null) || fail "/config.js is not served"
grep -qF "$API_URL" <<<"$config" || fail "/config.js does not hold the API address it was started with: $config"
grep -qF "$DSN" <<<"$config" || fail "/config.js does not hold the Sentry DSN it was started with: $config"
headers /config.js | grep -qi 'Cache-Control: no-store' || fail "/config.js may be cached"
policy=$(headers / | grep -i 'Content-Security-Policy:')
grep -qF "https://api.smoke.example" <<<"$policy" || fail "the policy does not allow the API origin: $policy"
grep -qF "https://o1.ingest.smoke.example" <<<"$policy" || fail "the policy does not allow Sentry's origin: $policy"
grep -qF "frame-src 'none';" <<<"$policy" || fail "the policy allows frames: $policy"
grep -q '__[A-Z_]*__' <<<"$policy" && fail "the policy still holds a placeholder: $policy"

# Nothing the build could have baked in: an address in the bundle would mean
# one image per environment again.
baked=$(docker exec "$NAME" grep -rl "api.smoke.example" /usr/share/nginx/html || true)
[ -z "$baked" ] || fail "the built files hold this deployment's addresses: $baked"

# A setting the browser would refuse stops the container instead of serving a
# blank page: here, the DSN left at the template's placeholder.
docker run -d --name "$NAME-bad-dsn" \
	-e VITE_API_URL="$API_URL" \
	-e VITE_SENTRY_DSN=https://your-sentry-dsn \
	"$IMAGE" >/dev/null
for ((waited_bad = 0; waited_bad < 20; waited_bad += 1)); do
	[ "$(docker inspect -f '{{.State.Running}}' "$NAME-bad-dsn")" = true ] || break
	sleep 1
done
[ "$(docker inspect -f '{{.State.Running}}' "$NAME-bad-dsn")" = false ] || fail "a malformed VITE_SENTRY_DSN did not stop the container"
docker logs "$NAME-bad-dsn" 2>&1 | grep -q 'VITE_SENTRY_DSN' || fail "the container stopped without naming VITE_SENTRY_DSN"

echo "✓ $IMAGE serves the app after ${waited}s, with its Content-Security-Policy and no sourcemaps"

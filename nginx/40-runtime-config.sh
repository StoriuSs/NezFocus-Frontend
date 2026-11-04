#!/bin/sh
# Writes this container's settings for the browser, at every start.
#
# The bundle holds no addresses: index.html loads /config.js first, and the app
# reads its settings from window.__APP_CONFIG__ (src/config/env.ts). This
# script writes that file from the container's environment, so one image runs
# in any environment — nothing is baked in at build time, and CI needs no
# per-environment settings to publish it.
#
# nginx's image runs every /docker-entrypoint.d/*.sh before nginx starts, so
# both files below exist by the time nginx reads its configuration.
#
#   /tmp/config.js   served as /config.js (nginx.conf), never cached
#   /tmp/csp.conf    the Content-Security-Policy, from the build's template
#                    with this environment's origins filled in
#
# Both go to /tmp: the web root stays read-only to the nginx user, so a flaw in
# the server can't rewrite what it serves.
set -eu

CONFIG_FILE=/tmp/config.js
CSP_FILE=/tmp/csp.conf
CSP_TEMPLATE=/etc/nginx/csp.conf.template

die() {
	echo "runtime-config: $1" >&2
	echo "runtime-config: the container will not start without it; see docs/deploy.md." >&2
	exit 1
}

# A value goes into a JavaScript string and an nginx header as it is, so keep
# it to what a URL or an identifier needs. Anything else is a mistake worth
# stopping for, not something to escape and serve.
checked() { # name value
	case "$2" in
		'') die "$1 is not set" ;;
		*[\"\\]* | *' '* | *"$(printf '\t')"*) die "$1 must not contain quotes, backslashes or spaces" ;;
	esac
	printf '%s' "$2"
}

# scheme://host[:port] of a URL, dropping any path — and any user info, so a
# Sentry DSN (https://<key>@<host>/<project>) yields just its host.
origin() { # name url
	origin_value=$(printf '%s' "$2" | sed -n -E 's#^(https?://)([^@/]+@)?([^/?#]+).*#\1\3#p')
	[ -n "$origin_value" ] || die "$1 is not an http(s) URL: $2"
	printf '%s' "$origin_value"
}

# The same rules as the browser's check (src/config/env.schema.ts): a DSN the
# browser refuses would stop the app there, leaving a blank page, so refuse it
# here, where deploy.sh sees the container fail and rolls back.
sentry_dsn() { # value
	printf '%s' "$1" | grep -Eq '^https?://[^@/[:space:]]+@[^/[:space:]]+/[^[:space:]]+$' \
		|| die "VITE_SENTRY_DSN is not a DSN: expected https://<key>@<host>/<project number>"
	printf '%s' "$1" | grep -Eiq 'your[-_]' && die "VITE_SENTRY_DSN is still the placeholder from .env.example"
	printf '%s' "$1"
}

API_URL=$(checked VITE_API_URL "${VITE_API_URL:-}")
SENTRY_DSN=${VITE_SENTRY_DSN:-}
[ -z "$SENTRY_DSN" ] || SENTRY_DSN=$(sentry_dsn "$SENTRY_DSN")
SENTRY_RELEASE=${VITE_SENTRY_RELEASE:-}
IMAGE_ORIGINS=${CSP_IMG_SRC:-}

# ─── The browser's settings ──────────────────────────────────────────────────
{
	echo '// Written at container start by /docker-entrypoint.d/40-runtime-config.sh.'
	echo 'window.__APP_CONFIG__ = {'
	printf '  "VITE_API_URL": "%s"' "$API_URL"
	[ -z "$SENTRY_DSN" ] || printf ',\n  "VITE_SENTRY_DSN": "%s"' "$(checked VITE_SENTRY_DSN "$SENTRY_DSN")"
	[ -z "$SENTRY_RELEASE" ] || printf ',\n  "VITE_SENTRY_RELEASE": "%s"' "$(checked VITE_SENTRY_RELEASE "$SENTRY_RELEASE")"
	printf '\n}\n'
} > "$CONFIG_FILE"

# ─── The Content-Security-Policy ─────────────────────────────────────────────
[ -f "$CSP_TEMPLATE" ] || die "$CSP_TEMPLATE is missing from the image"

image_origins=''
for value in $IMAGE_ORIGINS; do
	image_origins="$image_origins $(origin CSP_IMG_SRC "$value")"
done

sed -e "s#__API_ORIGIN__#$(origin VITE_API_URL "$API_URL")#g" \
	-e "s#__SENTRY_ORIGIN__#$([ -z "$SENTRY_DSN" ] || origin VITE_SENTRY_DSN "$SENTRY_DSN")#g" \
	-e "s#__EXTRA_IMAGE_ORIGINS__#${image_origins# }#g" \
	-e 's/  */ /g' \
	"$CSP_TEMPLATE" > "$CSP_FILE"

if grep -q '__[A-Z_]*__' "$CSP_FILE"; then
	die "a placeholder was left in the Content-Security-Policy: $(grep -o '__[A-Z_]*__' "$CSP_FILE" | sort -u | tr '\n' ' ')"
fi

tracking=off
[ -z "$SENTRY_DSN" ] || tracking="on ($(origin VITE_SENTRY_DSN "$SENTRY_DSN"))"
echo "runtime-config: API $(origin VITE_API_URL "$API_URL"), error tracking $tracking"

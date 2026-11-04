#!/usr/bin/env bash
# ============================================================================
# React Starter — Production Deploy
# ============================================================================
# Usage (from any directory; the script works in its own):
#   ./deploy.sh                    deploy the latest commit of the current branch
#   ./deploy.sh --rollback         go back to the previous successful release
#   ./deploy.sh --rollback <tag>   go back to a specific release
#   ./deploy.sh --list             list releases and show which one is live
#
# Options:
#   --no-pull        deploy the commit that is checked out, without git pull
#   --skip-build     build mode only: reuse the image already built for this commit
#   --allow-dirty    deploy even though the working tree has uncommitted changes
#   --reload-nginx   validate and reload the host's nginx afterwards (only
#                    needed after changing its config)
#   -h, --help       show this help
#
# Settings, read from .env.production:
#   DEPLOY_IMAGE_SOURCE    build     build the image on this server (default)
#                          registry  pull the image CI built for this commit.
#                                    Either way the VITE_* values come from
#                                    .env.production, when the container starts
#   DEPLOY_IMAGE           image name; for registry e.g. ghcr.io/you/your-frontend
#                          (default react-starter-auth-prod-app)
#   DEPLOY_KEEP_IMAGES     releases kept on this server (default 3)
#   DEPLOY_HEALTH_TIMEOUT  seconds to wait for the app to become healthy (default 120)
#
# A release is the app image tagged with the first 12 characters of its commit.
# If the new release doesn't become healthy, the previous one is started again.
# State lives in .deploy/ (gitignored): releases, history.log and the lock.
# Guide: docs/deploy.md
# ============================================================================

set -euo pipefail
cd "$(dirname "$0")"

# ─── Config ──────────────────────────────────────────────────────────────────
COMPOSE_FILE="docker-compose.prod.yaml"
ENV_FILE=".env.production"
APP_SERVICE="app"
# Services that must be healthy for a release to count.
CRITICAL_SERVICES=(app)
HEALTH_INTERVAL=3
STATE_DIR=".deploy"
RELEASES_FILE="$STATE_DIR/releases"
HISTORY_FILE="$STATE_DIR/history.log"
LOCK_FILE="$STATE_DIR/deploy.lock"

# ─── Output ──────────────────────────────────────────────────────────────────
log()  { printf '\033[36m▶\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠\033[0m %s\n' "$*" >&2; }
die()  {
	printf '\033[31m✗\033[0m %s\n' "$*" >&2
	# A deploy that stops before switching versions still belongs in the history.
	if [[ -n "$PENDING_DEPLOY" ]]; then
		local tag="$PENDING_DEPLOY"
		PENDING_DEPLOY=""
		record_history deploy "$tag" "failed (live release untouched)"
	fi
	exit 1
}
PENDING_DEPLOY=""
# A command that fails under set -e ends the script without passing through
# die: a deploy that had started is recorded all the same.
trap '[[ -z "$PENDING_DEPLOY" ]] || record_history deploy "$PENDING_DEPLOY" "failed (live release untouched)"' EXIT

usage() {
	awk 'NR > 4 && /^# ====/ { exit } NR > 4 { sub(/^# ?/, ""); print }' "$0"
}

# Prints stdin's lines last to first (tac isn't everywhere).
reverse_lines() { awk '{ line[NR] = $0 } END { for (i = NR; i > 0; i--) print line[i] }'; }

# ─── Flags ───────────────────────────────────────────────────────────────────
ACTION=deploy
ROLLBACK_TARGET=""
NO_PULL=false
SKIP_BUILD=false
ALLOW_DIRTY=false
RELOAD_NGINX=false

while (( $# > 0 )); do
	case "$1" in
		--rollback)
			ACTION=rollback
			if [[ -n "${2:-}" && "${2:0:1}" != "-" ]]; then
				ROLLBACK_TARGET="$2"
				shift
			fi
			;;
		--list)         ACTION=list ;;
		--no-pull)      NO_PULL=true ;;
		--skip-build)   SKIP_BUILD=true ;;
		--allow-dirty)  ALLOW_DIRTY=true ;;
		--reload-nginx) RELOAD_NGINX=true ;;
		-h|--help)      usage; exit 0 ;;
		*)              die "Unknown option: $1 (see --help)" ;;
	esac
	shift
done

# ─── Settings ────────────────────────────────────────────────────────────────
[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]]     || die "Env file not found: $ENV_FILE (copy .env.example and fill it in)"

# The last KEY=value in the env file, without quotes or a trailing " # comment".
# Accepts `export KEY=value`, `KEY: value` and spaces around "=", as compose
# does. Prints the second argument when the key is absent or empty.
env_value() {
	local value
	value=$(sed -nE "s/^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*(=|:[[:space:]])[[:space:]]*//p" "$ENV_FILE" | tail -n 1 \
		| sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/') || true
	printf '%s' "${value:-$2}"
}

# Keys assigned in the env file, in order, duplicates included.
env_file_keys() {
	sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*(=|:[[:space:]]).*/\2/p' "$ENV_FILE" | tr '\n' ' '
}

# Variables read outside the app: interpolated by the compose file, or read by
# this script. A key in the env file that neither these nor the app read has no
# effect — usually a typo.
external_env_keys() {
	{
		without_comments "$COMPOSE_FILE" | grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*' | cut -c3-
		# A secret's value: `environment: NAME` (a service's environment is a block)
		without_comments "$COMPOSE_FILE" | sed -nE 's/^[[:space:]]+environment:[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*$/\1/p'
		without_comments "$SCRIPT_FILE" | grep -oE 'env_value[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' | awk '{ print $2 }'
	} | sort -u | tr '\n' ' '
}

# A file without its # comments: a commented-out line still contains ${VAR},
# but reads nothing. CRLF is dropped: a file written on Windows otherwise left
# a \r on every value, and the patterns below stopped matching.
without_comments() { tr -d '\r' < "$1" | sed -E 's/(^|[[:space:]])#.*$/\1/'; }

# Keys whose value has a "$" outside single quotes (and not escaped as "$$"),
# which compose substitutes. Names only: values never leave this file.
dollar_env_keys() {
	sed -nE "s/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*([^'].*)$/\2 \3/p" "$ENV_FILE" \
		| awk '{ value = $0; gsub(/\$\$/, "", value) } index(value, "$") { print $1 }' | sort -u | tr '\n' ' '
}
SCRIPT_FILE=$(basename "$0")

SOURCE=$(env_value DEPLOY_IMAGE_SOURCE build)
IMAGE=$(env_value DEPLOY_IMAGE react-starter-auth-prod-app)
KEEP_IMAGES=$(env_value DEPLOY_KEEP_IMAGES 3)
HEALTH_TIMEOUT=$(env_value DEPLOY_HEALTH_TIMEOUT 120)

case "$SOURCE" in
	build) ;;
	registry)
		[[ "$IMAGE" == */* ]] || die "DEPLOY_IMAGE_SOURCE=registry needs DEPLOY_IMAGE set to the registry path, e.g. ghcr.io/you/your-app"
		[[ "$SKIP_BUILD" == false ]] || die "--skip-build only applies to DEPLOY_IMAGE_SOURCE=build"
		;;
	*) die "DEPLOY_IMAGE_SOURCE must be 'build' or 'registry', not '$SOURCE'" ;;
esac
[[ "${IMAGE##*/}" != *:* && "$IMAGE" != *@* ]] \
	|| die "DEPLOY_IMAGE is the image name without a tag (e.g. ghcr.io/you/your-app); releases add their own tag"
[[ "$IMAGE" == "${IMAGE,,}" ]] \
	|| die "DEPLOY_IMAGE must be lowercase, as Docker requires of image names: ${IMAGE,,} (CI publishes the repository's name in lowercase too)"
[[ "$KEEP_IMAGES" =~ ^[1-9][0-9]*$ ]]  || die "DEPLOY_KEEP_IMAGES must be a positive number"
if [[ "$SOURCE" == build ]] && (( KEEP_IMAGES < 2 )); then
	die "DEPLOY_KEEP_IMAGES must be 2 or more in build mode: with 1, the previous release's image is gone and a failed deploy can't roll back"
fi
[[ "$HEALTH_TIMEOUT" =~ ^[1-9][0-9]*$ ]] || die "DEPLOY_HEALTH_TIMEOUT must be a positive number of seconds"

command -v docker >/dev/null || die "docker not found in PATH"
docker compose version >/dev/null 2>&1 || die "The docker compose plugin is not installed"

# DEPLOY_IMAGE is passed explicitly so compose names the image exactly as this
# script does, even if the variable is also set in the shell.
compose() { DEPLOY_IMAGE="$IMAGE" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# The compose project name, for finding containers. Read at the start, and
# again after git pull.
load_compose_config() {
	COMPOSE_CONFIG=$(compose config 2>&1) || die "docker compose can't read $COMPOSE_FILE with $ENV_FILE: $COMPOSE_CONFIG"
	PROJECT=$(awk '/^name: / { print $2 }' <<< "$COMPOSE_CONFIG")
	[[ -n "$PROJECT" ]] || die "$COMPOSE_FILE has no top-level name:"
}
load_compose_config

# ─── Releases and history ────────────────────────────────────────────────────
current_release() { [[ -f "$RELEASES_FILE" ]] && tail -n 1 "$RELEASES_FILE" || true; }

# The most recent release before the current one that is a different tag.
# (One awk reading the whole file: an awk that exits early in a pipeline makes
# the writer before it die of SIGPIPE, which pipefail turns into an error.)
previous_release() {
	[[ -f "$RELEASES_FILE" ]] || return 0
	awk '{ line[NR] = $0 } END { for (i = NR - 1; i > 0; i--) if (line[i] != line[NR]) { print line[i]; exit } }' "$RELEASES_FILE"
}

record_release() { mkdir -p "$STATE_DIR"; printf '%s\n' "$1" >> "$RELEASES_FILE"; }

record_history() {
	mkdir -p "$STATE_DIR"
	printf '%s\t%-8s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" >> "$HISTORY_FILE"
}

# ─── Lock ────────────────────────────────────────────────────────────────────
# flock on a file: the kernel releases it when this process ends, however it
# ends, so there is never a stale lock to guess about.
acquire_lock() {
	command -v flock >/dev/null || die "flock not found in PATH (it is part of util-linux)"
	mkdir -p "$STATE_DIR"
	exec 8> "$LOCK_FILE"
	flock -n 8 || die "Another deploy is running. Wait for it to finish."
}

# ─── Images ──────────────────────────────────────────────────────────────────
image_exists() { docker image inspect "$1" >/dev/null 2>&1; }

# Pulls, with a couple of retries. A pull can fail for a moment rather than
# for a reason: a network blip, or another deploy working with images on the
# same host at the same time (seen as "lease does not exist" while the other
# project's deploy pruned its old releases).
pull_image() { # ref
	local attempt wait
	for attempt in 1 2 3; do
		docker pull "$1" && return 0
		((attempt < 3)) || return 1
		wait=$((attempt * 5))
		warn "Could not pull $1 (attempt $attempt); trying again in ${wait}s"
		sleep "$wait"
	done
}

# The addresses the app talks to. The container writes them into /config.js
# when it starts and refuses to start without them, whoever built the image, so
# they are checked here before anything is touched.
check_app_settings() {
	local key missing=()
	for key in VITE_API_URL; do
		[[ -n "$(env_value "$key" "")" ]] || missing+=("$key")
	done
	(( ${#missing[@]} == 0 )) \
		|| die "Set ${missing[*]} in $ENV_FILE: the app reads them at start (docs/deploy.md). Nothing was changed."
}

# Makes IMAGE:tag available locally, building or pulling it.
prepare_image() {
	local tag="$1" ref="$IMAGE:$1"
	if [[ "$SOURCE" == build ]]; then
		if [[ "$SKIP_BUILD" == true ]]; then
			image_exists "$ref" || die "--skip-build: there is no image $ref on this server. Deploy without --skip-build to build it."
			ok "Reusing $ref"
			return
		fi
		log "Building $ref…"
		APP_TAG="$tag" compose build --pull "$APP_SERVICE" || die "Image build failed; nothing was changed."
		ok "Built $ref"
	else
		if image_exists "$ref"; then
			ok "$ref is already on this server"
			return
		fi
		log "Pulling $ref…"
		pull_image "$ref" || die "Could not pull $ref. Has CI finished publishing commit $tag? Is this server logged in to the registry (docker login)? Is another deploy running on this host? Nothing was changed."
		ok "Pulled $ref"
	fi
}

# For rollback: the image must still be here (build) or pullable (registry).
ensure_release_image() {
	local ref="$IMAGE:$1"
	image_exists "$ref" && return 0
	if [[ "$SOURCE" == registry ]]; then
		log "Pulling $ref…"
		pull_image "$ref" && return 0
		warn "Could not pull $ref"
	else
		warn "The image $ref is no longer on this server (only the last $KEEP_IMAGES are kept)."
		warn "To go back to that commit, build it again: git checkout $1 && ./deploy.sh --no-pull"
	fi
	return 1
}

# Keeps the images of the last DEPLOY_KEEP_IMAGES releases, the live one
# included. Images of older releases and of failed deploys are removed.
prune_images() {
	local keep tag
	keep=$(awk -v n="$KEEP_IMAGES" '{ line[NR] = $0 } END { for (i = NR; i > 0 && count < n; i--) if (!seen[line[i]]++) { print line[i]; count++ } }' "$RELEASES_FILE")
	while read -r tag; do
		[[ -z "$tag" || "$tag" == latest || "$tag" == "<none>" ]] && continue
		grep -qx "$tag" <<< "$keep" && continue
		if docker image rm "$IMAGE:$tag" >/dev/null 2>&1; then
			log "Removed image $IMAGE:$tag"
		else
			warn "Could not remove $IMAGE:$tag (still in use?)"
		fi
	done < <(docker image ls "$IMAGE" --format '{{.Tag}}')
	docker image prune -f >/dev/null 2>&1 || true
	if [[ "$SOURCE" == build ]]; then
		docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
	fi
}

# ─── Health ──────────────────────────────────────────────────────────────────
# Restart counts before a start ("service container-id count" lines), so a
# container that crashes and is restarted by its restart policy counts as
# failing instead of "still starting".
BASELINE=""

# The service's own container, not a one-off `compose run` container of it
# (`compose ps -a` lists those too, and a leftover one sorts first).
container_id() {
	docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" \
		--filter "label=com.docker.compose.service=$1" --filter "label=com.docker.compose.oneoff=False" \
		| awk 'NR == 1'
}

remember_restart_counts() {
	local service id count
	BASELINE=""
	for service in "${CRITICAL_SERVICES[@]}"; do
		id=$(container_id "$service")
		count=0
		[[ -n "$id" ]] && count=$(docker inspect --format '{{.RestartCount}}' "$id" 2>/dev/null || echo 0)
		BASELINE+="$service ${id:--} $count"$'\n'
	done
}

# Restarts recorded for this service's container before the start; 0 for a new container.
baseline_restarts() {
	awk -v s="$1" -v id="$2" '$1 == s && $2 == id { n = $3 } END { print n + 0 }' <<< "$BASELINE"
}

show_logs() {
	local id
	id=$(container_id "$1")
	[[ -n "$id" ]] || return 0
	warn "Last 40 log lines of $1:"
	docker logs --tail 40 "$id" 2>&1 | sed 's/^/    /' >&2 || true
}

# Waits until every given service is running and, if it has a healthcheck,
# healthy. All of them are checked on every round, so an app that crashes while
# another service is still starting fails the wait at once. Returns 1 as soon as
# one exits, restarts or turns unhealthy, or when the timeout runs out.
wait_healthy() {
	local pending=("$@") deadline=$((SECONDS + HEALTH_TIMEOUT)) still service id state health restarts baseline
	log "Waiting for $* to become healthy (up to ${HEALTH_TIMEOUT}s)…"
	while (( ${#pending[@]} > 0 )); do
		still=()
		for service in "${pending[@]}"; do
			id=$(container_id "$service")
			state=missing health="" restarts=0
			if [[ -n "$id" ]]; then
				read -r state restarts health < <(docker inspect \
					--format '{{.State.Status}} {{.RestartCount}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" 2>/dev/null || echo "missing 0")
			fi
			baseline=$(baseline_restarts "$service" "${id:--}")

			if [[ "$state" == running && ( -z "$health" || "$health" == healthy ) ]]; then
				ok "$service: ${health:-running}"
				continue
			fi
			# "created" after `compose up` returned: it was never started.
			if [[ "$state" =~ ^(exited|dead|restarting|created)$ || "$health" == unhealthy ]] || (( restarts > baseline )); then
				warn "$service is failing (state: $state${health:+, health: $health}, restarts: $restarts)"
				show_logs "$service"
				return 1
			fi
			still+=("$service")
		done
		# ${a[@]+…}: bash before 4.4 treats an empty array as unset under set -u.
		pending=(${still[@]+"${still[@]}"})
		(( ${#pending[@]} > 0 )) || break
		if (( SECONDS >= deadline )); then
			for service in "${pending[@]}"; do
				warn "$service is not healthy after ${HEALTH_TIMEOUT}s"
				show_logs "$service"
			done
			return 1
		fi
		sleep "$HEALTH_INTERVAL"
	done
}

# ─── Releases ────────────────────────────────────────────────────────────────
# Warns about keys in the env file that have no effect: nothing reads them
# (usually a typo, which leaves the default in force), they are set twice, or,
# in registry mode, they are the sourcemap upload's, which belong to CI, where
# the image is built.
# The VITE_* values themselves are checked by check_app_settings, and again by
# the container when it starts (nginx/40-runtime-config.sh).
check_environment() {
	local keys duplicates unread dollar vite
	keys=$(env_file_keys | tr ' ' '\n' | sed '/^$/d')
	[[ -n "$keys" ]] || return 0
	duplicates=$(sort <<< "$keys" | uniq -d | tr '\n' ' ')
	unread=$(sort -u <<< "$keys" | grep -vxF -f <(external_env_keys | tr ' ' '\n' | sed '/^$/d') | tr '\n' ' ') || true
	dollar=$(dollar_env_keys)
	[[ -z "$duplicates" ]] || warn "Set more than once in $ENV_FILE (only the last one takes effect): $duplicates"
	[[ -z "$unread" ]]     || warn "Not read by $COMPOSE_FILE or $SCRIPT_FILE, so they have no effect: $unread"
	[[ -z "${dollar// /}" ]] || warn "These contain \"\$\", which docker compose reads as a variable; put the value in single quotes, or write each \$ as \$\$: $dollar"
	if [[ "$SOURCE" == registry ]]; then
		# Only these are built into the image; the rest reach the container at
		# start, whoever built it.
		built_in=$(sort -u <<< "$keys" | grep -E '^SENTRY_(AUTH_TOKEN|ORG|PROJECT)$' | tr '\n' ' ') || true
		[[ -z "$built_in" ]] || warn "Ignored in registry mode — sourcemaps are uploaded by whoever builds the image: $built_in"
	fi
	return 0
}

# Starts IMAGE:tag as the app. A problem with a service outside
# CRITICAL_SERVICES doesn't fail the release: that is decided by the app running
# this image and being healthy. compose stops starting containers at its first
# error, though, so the critical ones are then started on their own.
start_release() {
	local running
	remember_restart_counts
	log "Starting release $1…"
	if ! APP_TAG="$1" compose up -d --no-build --remove-orphans; then
		warn "docker compose up reported errors (above); starting ${CRITICAL_SERVICES[*]} on their own"
		APP_TAG="$1" compose up -d --no-build "${CRITICAL_SERVICES[@]}" \
			|| { warn "Could not start ${CRITICAL_SERVICES[*]}"; return 1; }
	fi
	running=$(docker inspect --format '{{.Config.Image}}' "$(container_id "$APP_SERVICE")" 2>/dev/null || true)
	[[ "$running" == "$IMAGE:$1" ]] || { warn "The $APP_SERVICE container runs ${running:-nothing}, not $IMAGE:$1"; return 1; }
}

# Marks a healthy release as live.
promote_release() {
	record_release "$1"
	docker tag "$IMAGE:$1" "$IMAGE:latest"
}

reload_nginx() {
	[[ "$RELOAD_NGINX" == true ]] || return 0
	command -v nginx >/dev/null || { warn "nginx is not installed on this host; not reloading"; return 0; }
	log "Validating and reloading nginx…"
	sudo nginx -t || die "nginx config is invalid; not reloading. The release itself is live."
	sudo systemctl reload nginx
	ok "nginx reloaded"
}

# ─── Commands ────────────────────────────────────────────────────────────────
list_releases() {
	local current tag
	current=$(current_release)
	[[ -f "$RELEASES_FILE" ]] || { log "No releases yet."; return; }
	printf 'Releases, newest first (%s mode, image %s):\n' "$SOURCE" "$IMAGE"
	while read -r tag; do
		printf '  %s %s  %s\n' \
			"$([[ "$tag" == "$current" ]] && echo '*' || echo ' ')" "$tag" \
			"$(image_exists "$IMAGE:$tag" && echo 'image on this server' || echo 'image pruned')"
	done < <(reverse_lines < "$RELEASES_FILE" | awk '!seen[$0]++')
	[[ -f "$HISTORY_FILE" ]] && { printf '\nLast deploys:\n'; tail -n 10 "$HISTORY_FILE" | sed 's/^/  /'; }
	return 0
}

rollback() {
	local current target
	current=$(current_release)
	target="${ROLLBACK_TARGET:-$(previous_release)}"
	[[ -n "$target" ]] || die "There is no previous release to roll back to."
	[[ "$target" != "$current" ]] || die "$target is already the live release."
	grep -qx "$target" "$RELEASES_FILE" 2>/dev/null \
		|| warn "$target was never deployed successfully from this server; trying anyway."

	check_app_settings
	ensure_release_image "$target" || die "Cannot roll back to $target."

	if start_release "$target" && wait_healthy "${CRITICAL_SERVICES[@]}"; then
		promote_release "$target"
		record_history rollback "$target" ok
		ok "Rolled back to $target"
		return
	fi
	record_history rollback "$target" failed

	# Don't leave the site on a release that doesn't work: start the one that was live.
	if [[ -n "$current" ]] && image_exists "$IMAGE:$current"; then
		warn "The rollback to $target did not become healthy. Starting $current again…"
		if start_release "$current" && wait_healthy "${CRITICAL_SERVICES[@]}"; then
			record_history restart "$current" "ok (after the rollback to $target failed)"
			die "The rollback to $target failed; $current is live again."
		fi
		record_history restart "$current" failed
		die "The rollback to $target failed, and $current did not come back either. Both ran with this checkout's $COMPOSE_FILE, so if that file is what broke, go back to a commit that worked: git checkout <tag> && ./deploy.sh --no-pull. Check: docker compose -f $COMPOSE_FILE ps"
	fi
	die "The rollback to $target did not become healthy. Check: docker compose -f $COMPOSE_FILE ps"
}

deploy() {
	command -v git >/dev/null || die "git not found in PATH"

	local changes
	# Checked on its own: inside [[ ]] a failing git status read as "no
	# changes", and the next git command failed with a misleading message.
	changes=$(git status --porcelain --untracked-files=no) \
		|| die "git status failed (above), so this checkout can't be deployed from as it is. Nothing was changed."
	if [[ -n "$changes" && "$ALLOW_DIRTY" == false ]]; then
		warn "The working tree has uncommitted changes. A release is labelled with its commit, so"
		warn "building these changes would produce an image that doesn't match its label."
		if [[ -t 0 ]]; then
			read -r -p "Deploy anyway? [y/N] " answer
			[[ "$answer" =~ ^[Yy]$ ]] || die "Aborted"
		else
			die "Commit or stash them, or pass --allow-dirty."
		fi
	fi

	if [[ "$NO_PULL" == false ]]; then
		local branch
		branch=$(git symbolic-ref --quiet --short HEAD) \
			|| die "HEAD is detached, so there is no branch to pull. Check out the branch to deploy (git switch main), or pass --no-pull to deploy this exact commit."
		log "Pulling $branch…"
		git pull --ff-only origin "$branch" \
			|| die "git pull failed (the branch can't be fast-forwarded?). Nothing was changed."
		# The pulled commit may have changed the compose file (a new service,
		# another project name): read it again.
		load_compose_config
	fi

	local tag previous
	tag=$(git rev-parse HEAD | cut -c1-12)
	previous=$(current_release)
	log "Deploying $tag ($(git log -1 --format=%s | cut -c1-72))"
	[[ -n "$previous" ]] && log "Live release: $previous"

	PENDING_DEPLOY="$tag"
	check_environment
	check_app_settings
	prepare_image "$tag"

	# From here on the outcome is recorded explicitly.
	PENDING_DEPLOY=""
	if start_release "$tag" && wait_healthy "${CRITICAL_SERVICES[@]}"; then
		promote_release "$tag"
		record_history deploy "$tag" ok
		prune_images
		reload_nginx
		printf '\n'
		if [[ -n "$previous" && "$previous" != "$tag" ]]; then
			ok "Release $tag is live (previous: $previous; to go back: ./deploy.sh --rollback)"
		else
			ok "Release $tag is live"
		fi
		return
	fi

	record_history deploy "$tag" failed
	if [[ -z "$previous" || "$previous" == "$tag" ]]; then
		die "Release $tag did not become healthy, and there is no earlier release to roll back to. Fix it and deploy again; its state: docker compose -f $COMPOSE_FILE ps"
	fi
	if ! ensure_release_image "$previous"; then
		die "Release $tag did not become healthy, and the image of $previous is unavailable, so there was no rolling back. Fix $tag and deploy again, or build $previous (see above); the state: docker compose -f $COMPOSE_FILE ps"
	fi

	warn "Release $tag did not become healthy. Rolling back to $previous…"
	if start_release "$previous" && wait_healthy "${CRITICAL_SERVICES[@]}"; then
		promote_release "$previous"
		record_history rollback "$previous" "ok (automatic)"
		die "Deploy of $tag failed; $previous is live again."
	fi
	record_history rollback "$previous" failed
	die "Deploy of $tag failed, and so did the rollback to $previous. A rollback swaps the image, not this checkout's $COMPOSE_FILE — if $tag changed that file, go back to the commit instead: git checkout $previous && ./deploy.sh --no-pull. Check: docker compose -f $COMPOSE_FILE ps"
}

# ─── Main ────────────────────────────────────────────────────────────────────

case "$ACTION" in
	list)     list_releases ;;
	rollback) acquire_lock; rollback ;;
	deploy)   acquire_lock; deploy ;;
esac

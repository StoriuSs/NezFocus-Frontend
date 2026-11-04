#!/usr/bin/env bash
# ============================================================================
# React Starter — One-time Nginx Bootstrap
# ============================================================================
# Runs on a fresh VPS (Ubuntu/Debian assumed). Installs Nginx + Certbot,
# renders the site config from the template, validates, reloads.
#
# Run ONCE per VPS, not on every deploy.
#
# Usage:
#   sudo ./bootstrap-nginx.sh \
#       --frontend-domain app.example.com \
#       --frontend-port   8081 \
#       --email           admin@example.com \
#       --site-name       my-app
# ============================================================================

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
# 8081 is the frontend's container host port. The convention here matches
# the rest of the starter family: backends on 3000, frontend on 8081 — that
# way you can deploy frontend + backend on the same VPS
# without port collisions.
FRONTEND_PORT="8081"
FRONTEND_DOMAIN=""
EMAIL=""
# Distinct from the Nest starter's default ("nest-api"): both are usually
# installed on the same VPS, and a shared name would overwrite the other's
# sites-available file.
SITE_NAME="react-app"
SKIP_CERTBOT=false
TEMPLATE="$(dirname "$0")/app.conf.template"

# ─── Parse args ──────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
	case "$1" in
		--frontend-domain) FRONTEND_DOMAIN="$2"; shift 2 ;;
		--frontend-port)   FRONTEND_PORT="$2";   shift 2 ;;
		--email)           EMAIL="$2";           shift 2 ;;
		--site-name)       SITE_NAME="$2";       shift 2 ;;
		--skip-certbot)    SKIP_CERTBOT=true;    shift ;;
		-h|--help)
			grep -E '^# ' "$0" | sed -E 's/^# ?//'
			exit 0
			;;
		*)
			echo "Unknown flag: $1" >&2
			echo "Run with --help for usage." >&2
			exit 2
			;;
	esac
done

# ─── Logging helpers ─────────────────────────────────────────────────────────
log()  { printf '\033[36m▶\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ─── Preflight ───────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Must run as root (use sudo)"

[[ -n "$FRONTEND_DOMAIN" ]] || die "--frontend-domain is required"
if [[ "$SKIP_CERTBOT" == "false" ]]; then
	[[ -n "$EMAIL" ]] || die "--email is required (or pass --skip-certbot to defer)"
fi
[[ -f "$TEMPLATE" ]] || die "Template not found: $TEMPLATE"

# ─── Install Nginx + Certbot ─────────────────────────────────────────────────
log "Installing Nginx and Certbot…"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot python3-certbot-nginx
ok "Nginx + Certbot installed"

# ─── UFW (if enabled, open HTTP/HTTPS) ───────────────────────────────────────
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
	log "Configuring UFW to allow HTTP/HTTPS…"
	ufw allow "Nginx Full" >/dev/null
	ok "UFW updated"
fi

# ─── Render template ─────────────────────────────────────────────────────────
log "Rendering Nginx config for ${FRONTEND_DOMAIN}…"

TARGET="/etc/nginx/sites-available/${SITE_NAME}"
sed \
	-e "s|FRONTEND_DOMAIN|${FRONTEND_DOMAIN}|g" \
	-e "s|FRONTEND_PORT|${FRONTEND_PORT}|g" \
	"$TEMPLATE" > "$TARGET"

ln -sf "$TARGET" "/etc/nginx/sites-enabled/${SITE_NAME}"

# Remove default site to avoid name collisions on bare server_name "_"
[[ -L /etc/nginx/sites-enabled/default ]] && rm /etc/nginx/sites-enabled/default

ok "Config written to $TARGET"

# ─── Validate + reload ───────────────────────────────────────────────────────
log "Validating Nginx config…"
nginx -t || die "nginx -t failed — fix $TARGET"
ok "Config valid"

log "Reloading Nginx…"
systemctl reload nginx
systemctl enable --now nginx >/dev/null
ok "Nginx reloaded and enabled at boot"

# ─── Certbot (HTTPS) ─────────────────────────────────────────────────────────
# Three possible paths:
#   1. --skip-certbot     → skip entirely, warn user to run later
#   2. Certs already exist → reinstall (no new issuance, just rewires the
#                            Nginx config — needed because re-running this
#                            script rewrites Nginx from the template and
#                            loses certbot's previously-injected 443 blocks)
#   3. Fresh deploy       → certonly + install, full first-time setup
CERT_DIR="/etc/letsencrypt/live/${FRONTEND_DOMAIN}"

if [[ "$SKIP_CERTBOT" == "true" ]]; then
	warn "Skipping certbot (--skip-certbot)"
	warn "Run manually when DNS resolves:"
	warn "  sudo certbot --nginx -d ${FRONTEND_DOMAIN} --email ${EMAIL:-YOUR_EMAIL} --agree-tos --redirect --non-interactive"
elif [[ -d "$CERT_DIR" ]]; then
	log "Certificates already exist at ${CERT_DIR} — reinstalling (no new cert issuance)…"
	certbot install --nginx \
		--cert-name "$FRONTEND_DOMAIN" \
		--redirect \
		--non-interactive \
		|| die "Certbot install failed — try 'sudo certbot --nginx -d ${FRONTEND_DOMAIN} --redirect' manually"
	ok "Certificates rewired; HTTP→HTTPS redirect re-applied"
else
	log "Obtaining Let's Encrypt certificate (certbot)…"
	certbot --nginx \
		-d "$FRONTEND_DOMAIN" \
		--email "$EMAIL" \
		--agree-tos \
		--redirect \
		--non-interactive \
		|| die "Certbot failed — check that DNS A-record for ${FRONTEND_DOMAIN} points to this VPS"
	ok "Certificate installed; HTTP→HTTPS redirect configured"
fi

# Confirm renewal timer is active
if [[ "$SKIP_CERTBOT" != "true" ]]; then
	if systemctl is-active --quiet certbot.timer; then
		ok "certbot.timer is active (auto-renewal enabled)"
	else
		warn "certbot.timer is not active — enabling it"
		systemctl enable --now certbot.timer
	fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
printf '\n'
ok "Nginx bootstrap complete"
printf '   Frontend:  https://%s  →  127.0.0.1:%s\n' "$FRONTEND_DOMAIN" "$FRONTEND_PORT"
printf '\n'
printf '   Validate: curl -I https://%s\n' "$FRONTEND_DOMAIN"
printf '   Renew:    sudo certbot renew --dry-run\n'
printf '   Reload:   sudo systemctl reload nginx\n'

#!/usr/bin/env bash
# Runs ON the VM (the relay's own, beside it), as a sudoer, from the directory
# deploy.sh copied over:   ./setup.sh relay.example.com
# Idempotent: re-running upgrades the three bundles and keeps collab.env.
# M347 — docs/collab.md is the operator's page.
set -euo pipefail
DOMAIN="${1:?usage: setup.sh <dns name pointing at this VM>}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update && sudo apt-get install -y caddy
fi

id tc-collab >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin tc-collab
sudo install -d -m 0755 /opt/tc-collab
sudo install -d -m 0750 -g tc-collab /etc/tc-collab
# Backups hold whole canvases: the service user's alone.
sudo install -d -m 0700 -o tc-collab -g tc-collab /var/backups/tc-collab
sudo install -d -m 0750 -o tc-collab -g tc-collab /var/lib/tc-collab

for f in main.cjs backup.cjs health.cjs; do sudo install -m 0644 "$HERE/$f" "/opt/tc-collab/$f"; done
[ -f /etc/tc-collab/collab.env ] || sudo install -m 0640 -g tc-collab "$HERE/collab.env.example" /etc/tc-collab/collab.env

for u in tc-collab.service tc-collab-backup.service tc-collab-backup.timer tc-collab-health.service tc-collab-health.timer; do
  sudo install -m 0644 "$HERE/$u" "/etc/systemd/system/$u"
done
# ONE Caddyfile for the VM — the relay's, which routes /collab too (TLS by
# Caddy's own ACME: a certificate for $DOMAIN, renewed on its own).
sed "s/relay.example.com/$DOMAIN/" "$HERE/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now tc-collab tc-collab-backup.timer tc-collab-health.timer
sudo systemctl restart tc-collab caddy
sleep 1
curl -fsS http://127.0.0.1:1234/healthz && echo
echo "tc-collab: up. Edit /etc/tc-collab/collab.env (TC_SUPABASE_URL, TC_SUPABASE_ANON_KEY, TC_COLLAB_DATABASE_URL, TC_ALERT_WEBHOOK), then: sudo systemctl restart tc-collab"
echo "The app's TC_PRESENCE_URL is wss://$DOMAIN/collab"

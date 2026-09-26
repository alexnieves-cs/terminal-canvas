#!/usr/bin/env bash
# Runs ON the Oracle Always Free VM (Ubuntu 22.04/24.04, Ampere A1 aarch64 or
# E2.1.Micro x86_64), as a sudoer, from the directory deploy.sh copied over:
#   ./setup.sh relay.example.com
# Idempotent: re-running it upgrades main.cjs and keeps relay.env/programs.json.
set -euo pipefail
DOMAIN="${1:?usage: setup.sh <dns name pointing at this VM>}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# Node 22 (node-pty 1.1 builds against it), and the toolchain node-pty's
# native addon needs — it is compiled HERE, for this arch.
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get install -y build-essential python3 debian-keyring debian-archive-keyring apt-transport-https curl

if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update && sudo apt-get install -y caddy
fi

id tc-relay >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /home/tc-relay --shell /bin/bash tc-relay
sudo install -d -o tc-relay -g tc-relay /home/tc-relay/work
sudo install -d -o tc-relay -g tc-relay -m 0750 /var/log/tc-relay
sudo install -d -m 0755 /opt/tc-relay /etc/tc-relay

sudo install -m 0644 "$HERE/main.cjs" /opt/tc-relay/main.cjs
sudo install -m 0644 "$HERE/package.json" /opt/tc-relay/package.json
(cd /opt/tc-relay && sudo npm install --omit=dev --no-audit --no-fund)
# node-pty 1.1.0's macOS prebuilds ship spawn-helper without its exec bit
# ("posix_spawnp failed"); Linux forks natively and has none, so this is a no-op here.
sudo find /opt/tc-relay/node_modules/node-pty -name spawn-helper -exec chmod +x {} + 2>/dev/null || true

[ -f /etc/tc-relay/relay.env ] || sudo install -m 0640 -g tc-relay "$HERE/relay.env.example" /etc/tc-relay/relay.env
[ -f /etc/tc-relay/programs.json ] || sudo install -m 0644 "$HERE/programs.example.json" /etc/tc-relay/programs.json

sudo install -m 0644 "$HERE/tc-relay.service" /etc/systemd/system/tc-relay.service
sed "s/relay.example.com/$DOMAIN/" "$HERE/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null

# Oracle's Ubuntu images ship an iptables INPUT chain that REJECTs everything
# but 22 — the VCN security list is not the only firewall. Open 80 (ACME) and
# 443 above the REJECT, and persist it.
for p in 80 443; do
  if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT 2>/dev/null; then
    # Directly above the first REJECT, wherever this image put it (5 or 6).
    at="$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
    sudo iptables -I INPUT "${at:-1}" -p tcp -m state --state NEW --dport "$p" -j ACCEPT
  fi
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

sudo systemctl daemon-reload
sudo systemctl enable --now tc-relay
sudo systemctl restart tc-relay caddy
sleep 1
curl -fsS http://127.0.0.1:7681/healthz && echo "tc-relay: up. Edit /etc/tc-relay/relay.env (TC_SUPABASE_URL, TC_SUPABASE_ANON_KEY, TC_RELAY_SPAWNERS) and programs.json, then: sudo systemctl restart tc-relay"
echo "Also open TCP 80 and 443 in the VCN security list (Networking → Virtual cloud networks → Security Lists)."

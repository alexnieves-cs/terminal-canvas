#!/usr/bin/env bash
# Runs on the Mac: build the collab bundles, copy them and this folder to the
# VM, run setup.sh there. The relay's VM and domain by default:
#   TC_RELAY_SSH=ubuntu@<vm ip> TC_RELAY_DOMAIN=relay.example.com npm run collab:deploy
# (TC_COLLAB_SSH / TC_COLLAB_DOMAIN override them for a VM of its own.)
set -euo pipefail
SSH_TARGET="${TC_COLLAB_SSH:-${TC_RELAY_SSH:?set TC_RELAY_SSH=ubuntu@<vm ip> (or TC_COLLAB_SSH)}}"
DOMAIN="${TC_COLLAB_DOMAIN:-${TC_RELAY_DOMAIN:?set TC_RELAY_DOMAIN to the DNS name pointing at the VM (or TC_COLLAB_DOMAIN)}}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
node "$ROOT/scripts/collab-server.cjs" --build-only
STAGE="$(mktemp -d)"
cp "$ROOT"/out/collab/{main,backup,health}.cjs "$ROOT"/server/collab/deploy/* "$STAGE/"
# The VM's one Caddyfile is the relay's (it routes /collab as well).
cp "$ROOT/server/relay/deploy/Caddyfile" "$STAGE/Caddyfile"
ssh "$SSH_TARGET" 'rm -rf ~/tc-collab-deploy && mkdir -p ~/tc-collab-deploy'
scp -q "$STAGE"/* "$SSH_TARGET:tc-collab-deploy/"
ssh -t "$SSH_TARGET" "cd ~/tc-collab-deploy && bash setup.sh '$DOMAIN'"
rm -rf "$STAGE"

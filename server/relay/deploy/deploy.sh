#!/usr/bin/env bash
# Runs on the Mac: build the relay, copy it and this folder to the VM, run setup.sh there.
#   TC_RELAY_SSH=ubuntu@<vm ip> TC_RELAY_DOMAIN=relay.example.com npm run relay:deploy
set -euo pipefail
: "${TC_RELAY_SSH:?set TC_RELAY_SSH=ubuntu@<vm ip>}"
: "${TC_RELAY_DOMAIN:?set TC_RELAY_DOMAIN to the DNS name pointing at the VM}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
node "$ROOT/scripts/relay-server.cjs" --build-only
STAGE="$(mktemp -d)"
cp "$ROOT/out/relay/main.cjs" "$ROOT/server/relay/package.json" "$ROOT"/server/relay/deploy/* "$STAGE/"
ssh "$TC_RELAY_SSH" 'rm -rf ~/tc-relay-deploy && mkdir -p ~/tc-relay-deploy'
scp -q "$STAGE"/* "$TC_RELAY_SSH:tc-relay-deploy/"
ssh -t "$TC_RELAY_SSH" "cd ~/tc-relay-deploy && bash setup.sh '$TC_RELAY_DOMAIN'"
rm -rf "$STAGE"

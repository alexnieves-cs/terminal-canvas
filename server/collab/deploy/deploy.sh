#!/usr/bin/env bash
# Runs on the Mac: build the collab bundles, copy them and this folder to the
# VM, run setup.sh there:
#   TC_COLLAB_SSH=ubuntu@<vm ip> TC_COLLAB_DOMAIN=collab.example.com npm run collab:deploy
# TC_RELAY_SSH / TC_RELAY_DOMAIN still work, for a VM set up before M685 removed the relay.
set -euo pipefail
SSH_TARGET="${TC_COLLAB_SSH:-${TC_RELAY_SSH:?set TC_COLLAB_SSH=ubuntu@<vm ip>}}"
DOMAIN="${TC_COLLAB_DOMAIN:-${TC_RELAY_DOMAIN:?set TC_COLLAB_DOMAIN to the DNS name pointing at the VM}}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
node "$ROOT/scripts/collab-server.cjs" --build-only
STAGE="$(mktemp -d)"
cp "$ROOT"/out/collab/{main,backup,health}.cjs "$ROOT"/server/collab/deploy/* "$STAGE/"
ssh "$SSH_TARGET" 'rm -rf ~/tc-collab-deploy && mkdir -p ~/tc-collab-deploy'
scp -q "$STAGE"/* "$SSH_TARGET:tc-collab-deploy/"
ssh -t "$SSH_TARGET" "cd ~/tc-collab-deploy && bash setup.sh '$DOMAIN'"
rm -rf "$STAGE"

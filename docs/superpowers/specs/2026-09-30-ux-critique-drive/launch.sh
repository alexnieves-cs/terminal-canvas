#!/bin/zsh
# Launch the REAL built app, fenced, with a CDP port for drive.cjs.
# usage: launch.sh <slot 1..9>  → CDP on 92<slot>0, userData /tmp/tcc-<slot>, tmux socket tc-critic-<slot>
# Requires `npm run build` first. NOT fenced: HOME. A spawned claude reads the person's own
# ~/.claude/settings.json (permission mode, allow rules), and New note writes to the notes folder
# setting — account for both before calling an agent's behaviour the app's.
SLOT=$1; REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
UD="/tmp/tcc-$SLOT"; mkdir -p "$UD"
unset ELECTRON_RUN_AS_NODE
cd "$REPO"
TC_ALLOW_MULTI=1 TC_TMUX_SOCKET="tc-critic-$SLOT" nohup "$REPO/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" \
  --user-data-dir="$UD" --remote-debugging-port=92${SLOT}0 "$REPO/out/main/index.js" > "$UD/app.log" 2>&1 &
echo $! > "$UD/pid"; echo "pid $(cat $UD/pid) port 92${SLOT}0 log $UD/app.log"

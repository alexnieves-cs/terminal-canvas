#!/bin/bash
# The harness uses fixed fixture directory names and one verify tmux socket.
# TC_VERIFY_ELECTRON_JOBS>1 is measured unreliable. Two worktrees running
# Electron suites at once corrupt each other's results. macOS has no flock(1):
# an atomic mkdir is the lock on both macOS and Linux.
LOCK=/tmp/tc-rd-electron.lock
until mkdir "$LOCK" 2>/dev/null; do
  PID=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$PID" ] && ! kill -0 "$PID" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
  echo "waiting for Electron lock (held by pid ${PID:-?}: $(cat "$LOCK/who" 2>/dev/null || true))"
  sleep 15
done
echo $$ > "$LOCK/pid"
echo "${RD_LANE:-?} $(pwd)" > "$LOCK/who"
trap 'rm -rf "$LOCK"' EXIT
unset ELECTRON_RUN_AS_NODE
"$@"

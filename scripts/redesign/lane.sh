#!/bin/bash
# usage: scripts/redesign/lane.sh <worktree-name> <LANE> [base-ref]
# Creates ../tc-rd-<name> on rd/<name>, installs, and opens a plan-mode
# Claude Code window. Pass the wave tag (rd-p0, rd-foundations, …) as the
# third argument — the launch lines in docs/redesign/RUN.md do.
set -euo pipefail
NAME=${1:?name}
LANE=${2:?lane}
if [ -n "${3:-}" ]; then
  BASE=$3
elif git rev-parse --verify --quiet refs/heads/redesign/main >/dev/null; then
  BASE=$(git describe --tags --abbrev=0 redesign/main)
else
  echo "No redesign/main and no base ref. Pass one: scripts/redesign/lane.sh $NAME $LANE rd-p0" >&2
  exit 1
fi
DIR=../tc-rd-$NAME
git worktree add "$DIR" -b "rd/$NAME" "$BASE"
( cd "$DIR" && npm ci && node node_modules/electron/install.js )
if ! command -v tmux >/dev/null 2>&1; then
  echo "Worktree ready at $DIR. tmux is not on PATH; start Claude there yourself:" >&2
  echo "  cd $DIR && RD_LANE=$LANE claude --permission-mode plan" >&2
  exit 0
fi
tmux has-session -t rd 2>/dev/null || tmux new-session -d -s rd -n lead
if command -v claude >/dev/null 2>&1; then
  tmux new-window -t rd -n "$LANE" -c "$DIR" \
    "RD_LANE=$LANE claude --permission-mode plan; exec \$SHELL"
else
  tmux new-window -t rd -n "$LANE" -c "$DIR"
  echo "claude is not on PATH. In the $LANE window: RD_LANE=$LANE claude --permission-mode plan" >&2
fi
echo "Attach: tmux attach -t rd   (window $LANE, base $BASE)"

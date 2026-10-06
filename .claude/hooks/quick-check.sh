#!/bin/bash
# PostToolUse. Cheap plain-node checks for the file just written. Never the
# Electron tier. Exit 2 surfaces the failure to Claude; exit 0 otherwise.
INPUT=$(cat)
export RD_QUICK_INPUT="$INPUT"
FILE=$(node -e '
const i = JSON.parse(process.env.RD_QUICK_INPUT || "{}")
const t = i.tool_input || i
const f = t.file_path || t.path || ""
process.stdout.write(f)
')
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
case "$FILE" in
  *styles.css)            npm run -s verify:styles ;;
  *panel-state.ts|*rail*) npm run -s verify:rail ;;
  */world/*)              npm run -s verify:world ;;
  */palette/*)            npm run -s verify:palette ;;
  *) exit 0 ;;
esac
status=$?
if [ "$status" -ne 0 ]; then
  echo "quick-check failed for $FILE (exit $status)" >&2
  exit 2
fi
exit 0

# M555 (lane J). The image a sandboxed lane boots: `terminal-canvas/lane:1`.
#
#   container build -t terminal-canvas/lane:1 docs/streams/vm-lane     # Apple container
#   docker build    -t terminal-canvas/lane:1 docs/streams/vm-lane     # Docker / OrbStack
#
# It carries Claude Code, git, and the network lock (tc-vm-entry). The agent
# runs as `agent`, uid 501 by default — the first macOS user's uid — so what
# it writes into the bind-mounted worktree is owned by the person on the Mac.
# Build with `--build-arg AGENT_UID=$(id -u)` if yours differs.
FROM node:22-bookworm-slim

ARG AGENT_UID=501
ARG CLAUDE_CODE_VERSION=latest

RUN apt-get update \
 && apt-get install -y --no-install-recommends git iptables ca-certificates util-linux procps curl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force \
 && (getent passwd "${AGENT_UID}" | cut -d: -f1 | xargs -r userdel -r 2>/dev/null || true) \
 && useradd --uid "${AGENT_UID}" --create-home --home-dir /home/agent --shell /bin/bash agent \
 && mkdir -p /home/agent/.claude /work \
 && chown -R agent:agent /home/agent

COPY tc-vm-entry.sh /usr/local/bin/tc-vm-entry
RUN chmod 0755 /usr/local/bin/tc-vm-entry

WORKDIR /work
ENTRYPOINT ["/usr/local/bin/tc-vm-entry"]

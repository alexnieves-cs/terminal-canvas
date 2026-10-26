# Lane Q (M594). Terminal Canvas, hosted: the app's own main process on
# Linux, the renderer in a browser tab. Build from the repo root:
#   docker build -f deploy/host/Dockerfile -t terminal-canvas-host .
#   docker run -p 8080:8080 -e TC_HOST_TOKEN=<long random> -v tc-home:/home/tc terminal-canvas-host
# docs/hosted.md has the deploy steps and the security notes.

# ── build: both halves, from the same checkout the Mac app builds from ──
FROM node:22-bookworm AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts: the postinstall rebuilds node-pty for ELECTRON's ABI,
# which is the wrong Node for a host. The host's own node-pty is built below.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN node scripts/build-host.cjs
# node-pty, built for THIS Node: the one package the bundle keeps outside it.
RUN mkdir /pty && cd /pty && npm init -y >/dev/null \
  && npm install --no-audit --no-fund "node-pty@$(node -p "require('/src/package.json').dependencies['node-pty']")"

# ── run ──
FROM node:22-bookworm-slim
# tmux: sessions outlive a closed tab and a host restart's page, as on the Mac.
# git and ssh: the app's review, worktree and PR doors are git.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tmux git openssh-client ca-certificates curl less procps locales \
  && sed -i 's/# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen \
  && rm -rf /var/lib/apt/lists/*
# The agent CLI the app is built around. Signing in happens in a terminal
# panel, the first time, like on a new Mac. TC_HOST_AGENTS="" skips it.
ARG TC_HOST_AGENTS="@anthropic-ai/claude-code"
RUN if [ -n "$TC_HOST_AGENTS" ]; then npm install -g --no-audit --no-fund $TC_HOST_AGENTS; fi
# A person, not root: every shell the canvas opens runs as this user.
RUN useradd --create-home --shell /bin/bash tc
WORKDIR /app
COPY --from=build /src/package.json ./package.json
COPY --from=build /src/out/host ./out/host
COPY --from=build /src/out/host-web ./out/host-web
COPY --from=build /pty/node_modules ./node_modules
ENV NODE_ENV=production \
    LANG=en_US.UTF-8 \
    PORT=8080 \
    TC_HOST_APP_ROOT=/app \
    TC_HOST_DATA=/home/tc/.terminal-canvas-host \
    SHELL=/bin/bash
USER tc
# ONE volume: the home folder holds the canvas (its data folder), the
# person's repositories and their agents' sign-ins. Lose it and all three go.
VOLUME ["/home/tc"]
WORKDIR /home/tc
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1
# No TC_HOST_TOKEN here, ever: an image with a token baked in is a shell for
# anyone who pulls it. Without one the host listens on loopback only, which in
# a container means nowhere, so a forgotten token fails closed.
CMD ["node", "/app/out/host/host.cjs"]

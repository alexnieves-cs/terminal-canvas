# Terminal Canvas, hosted

Lane Q (M590–M594). The whole app on a server, opened from any browser. There is
no Mac in the loop: the server runs the app's own main process, terminals and
agents run on the server, and the tab draws the same renderer the Mac app draws.

This is not the [live demo](https://alexnieves-cs.github.io/terminal-canvas/)
(lane N). The demo has scripted agents and recorded terminals and needs no
server. The hosted version is the real app. Its shells are real shells, so it
sits behind a sign-in token.

## How it works

```
 browser tab                                  host (Linux, Node 22)
 ┌──────────────────────────────┐             ┌──────────────────────────────────┐
 │ src/renderer   (unchanged)   │             │ src/main       (unchanged)       │
 │ src/preload    (unchanged)   │  WebSocket  │   every `electron` import is     │
 │   `electron` → host-web/     │◀──────────▶│   src/host/electron-shim.ts      │
 │   ipc-renderer.ts            │  /__tc/ws   │ src/host/hub.ts  (ipcMain ⇄ tab) │
 │ src/host-web   (dialogs,     │             │ src/host/server.ts (gate, files) │
 │   keys, lost connection)     │             │ node-pty, tmux, git, claude      │
 └──────────────────────────────┘             └──────────────────────────────────┘
```

- **Main runs unedited.** `scripts/build-host.cjs` bundles `src/main/index.ts`
  with `electron` aliased to `src/host/electron-shim.ts`: `ipcMain` is the hub,
  a window's `webContents.send` is a frame to the tab, `dialog.*` asks the person
  in the tab, and `safeStorage` is AES-GCM with its key on the host. A member main
  calls that the stand-in lacks is a loud error, and `verify:host` host.shim.1
  checks the inventory on every run.
- **The tab runs the app's own preload.** `vite.host.config.ts` points the
  preload's `electron` import at a WebSocket, so every door on `window.canvas`
  is the preload's own line. A door added to the app is a door here on the next
  build.
- **One tab at a time.** Main was written for one window. A newer tab takes the
  session over. The older tab is told so, and main sees what a Cmd+R looks like
  in the app: on tmux every shell keeps running and reattaches.
- **The wire is tagged JSON** (`src/host/wire.ts`), so a Buffer, a Date or an
  `undefined` in an array arrives as IPC's structured clone would deliver it.

## Run it

On any Linux or Mac with Node 22, tmux and git:

```sh
npm ci --ignore-scripts
npx node-gyp rebuild --directory node_modules/node-pty   # node-pty for plain Node, not Electron
npm run build:host
npm run host                                             # http://127.0.0.1:8080, no sign-in, this machine only
```

Without `TC_HOST_TOKEN` the host binds to loopback and asks for no sign-in.
With one, it listens on every interface and asks for it.

| Variable | Default | What it does |
|---|---|---|
| `TC_HOST_TOKEN` | none | The access token. **Required off loopback.** The host refuses to start without it. |
| `PORT` | `8080` | The port. |
| `TC_HOST_BIND` | `0.0.0.0` with a token, else `127.0.0.1` | The bind address. |
| `TC_HOST_DATA` | `~/.terminal-canvas-host` | The app's data folder (layout, settings, sealed credentials, the host key). |
| `TC_HOST_SECRET` | none | Derives the credential key from a secret, so a lost data folder does not lose the key. |
| `TC_TMUX_SOCKET` | the app's | The tmux socket name. |

## Deploy

The image is `deploy/host/Dockerfile`. Build it from the repo root. It runs as
the user `tc`, keeps everything in one volume at `/home/tc` (the canvas data,
your repositories and agent sign-ins) and includes tmux, git and Claude Code.

```sh
docker build -f deploy/host/Dockerfile -t terminal-canvas-host .
docker run -d -p 8080:8080 \
  -e TC_HOST_TOKEN="$(openssl rand -hex 24)" \
  -v tc-home:/home/tc \
  terminal-canvas-host
```

Any host that runs a container with a volume works. Put it behind HTTPS: the
platforms below do that for you. The cookie is marked `Secure` when the proxy
says `X-Forwarded-Proto: https`.

- **Railway.** New service → deploy from this GitHub repo → Settings → Build →
  Dockerfile path `deploy/host/Dockerfile`. Add a volume mounted at `/home/tc`.
  Set `TC_HOST_TOKEN` under Variables. Generate a domain.
- **Fly.io.** `fly launch --dockerfile deploy/host/Dockerfile --no-deploy`, then
  `fly volumes create tc_home --size 10`, mount it at `/home/tc` in `fly.toml`,
  `fly secrets set TC_HOST_TOKEN=…`, and `fly deploy`.
- **A VM you own.** `docker run` as above behind Caddy (the relay's
  `server/relay/deploy/Caddyfile` shows the shape).

First visit: sign in with the token, then open a terminal from the palette
(⌘K → New Terminal) and run `claude` to sign Claude Code in on the host.

## Security

The host runs shells. Whoever passes the gate has a shell on that machine, with
the files and sign-ins in its volume.

- **No token, no listening off loopback.** `startHost` throws before anything
  listens, and `host-main.ts` starts the gate before main loads, so a refused
  host has not started tmux or written a layout (`host.boot.1`).
- **Everything but `/healthz` and the sign-in page needs the cookie.** The
  cookie holds an issue time and an HMAC of it under the token, never the
  token. It is `HttpOnly` and `SameSite=Strict`, it is compared in constant
  time, and it expires after 30 days. A token shorter than 16 characters is
  refused at start.
- **Failed sign-ins back off.** The wait doubles from 1 second up to a minute
  per address, and the whole host takes at most 30 tries a minute. Each try is
  counted when it arrives, so parallel guesses are counted too.
- **The WebSocket also checks `Origin` against `Host`.** A browser sends cookies
  on a cross-site WebSocket too, so without this check any page you visit could
  drive your host.
- **No-token mode answers only to a loopback `Host`.** Binding to 127.0.0.1 is
  not enough by itself: a site that rebinds its DNS name to 127.0.0.1 would
  otherwise reach the port.
- **Nothing a request carries can crash the host.** Malformed cookies, paths
  and frames get a 400 or are dropped.
- **The token and `TC_HOST_SECRET` leave the environment before main loads,**
  so no terminal or agent inherits them.
- **Change the token to sign everyone out.** Old cookies stop matching.
- **Credentials stay on the host.** `safeStorage` seals them with a key in the
  data folder (mode 0600) or derived from `TC_HOST_SECRET`. As on the Mac,
  plaintext never crosses to the tab.
- **One person per host.** There are no accounts and no roles. Teammates share
  a canvas through the collab server (lane P), not by sharing one host's token.
- The image never contains a token. One baked in would give a shell to anyone
  who pulls the image (`host.docker.1`).

## What the hosted version cannot do

What depends on being a Mac window is either missing or works differently:

- **The browser pane.** `<webview>` exists only in Electron, so a browser panel
  shows nothing in a tab.
- **Window captures.** Canvas PNG export and deck PDF need Electron's
  `capturePage`/`printToPDF`. On a host they fail rather than save.
- **Files on your computer.** Open and save dialogs take a path *on the host*.
  A file dropped on the tab has no host path. Exports save on the host.
- **Some keys move.** A browser keeps ⌘N, ⌘T and ⌘W for itself, so in a tab
  those chords take ⌥ instead (⌥N is New task). Off a Mac, Ctrl stands for ⌘;
  inside a terminal or a text field, where Ctrl is the shell's or the field's,
  Ctrl+Shift does. Settings ▸ Keyboard prints each chord as this tab takes it.
  Copy, paste, undo and redo work, and paste uses this computer's clipboard.
  Menu keys are matched in the tab and run on the host.
- **No Finder.** Reveal-in-Finder rows are left out of the palette, since the
  Finder they would open is the host's.
- **Mac-only parts.** There is no dock badge, notifications, menu-bar item,
  global hotkey or Apple-container VM lanes (lane J).
- **More than one tab.** A newer tab takes over (see above).

## Files

| Path | What |
|---|---|
| `src/host/electron-shim.ts` | `electron` for main on a server |
| `src/host/hub.ts` | `ipcMain` and `webContents.send` over one socket; the one-tab rule |
| `src/host/server.ts` | The gate, the page's files, the socket |
| `src/host/wire.ts` | The frame format both ends read |
| `src/host/host-main.ts` | The entry: gate first, then main |
| `src/host-web/` | The tab: `ipcRenderer` over the socket, dialogs, keys, connection notice |
| `scripts/build-host.cjs`, `vite.host.config.ts` | `npm run build:host` → `out/host/host.cjs` + `out/host-web/` |
| `deploy/host/Dockerfile` | The image |
| `scripts/verify-host.cjs` | `verify:host`, plain node, in `npm run verify` |
| `scripts/host-smoke.cjs`, `.github/workflows/host.yml` | A real browser against a real host and against the image, on every PR |

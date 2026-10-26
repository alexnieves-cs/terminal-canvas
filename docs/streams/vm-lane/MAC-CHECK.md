# Sandboxed lanes — the real-Mac check (M555)

CI's macOS runners cannot run a nested VM, so `verify:vm` drives every arm of
lane J with a fake runtime. These are the facts only a real Mac can confirm.
Each is listed as manual-only in `docs/load-bearing.md`; tick one off here with
the date, the machine and the runtime version when it has been seen.

Needs: an Apple silicon Mac on macOS 26 with Apple's `container` (and, for the
second pass, OrbStack or Docker Desktop), the app built from `main`, and a token
from `claude setup-token` exported as `CLAUDE_CODE_OAUTH_TOKEN` in the login
shell (`~/.zprofile`).

## 1. Build the image

```sh
container system start
container build -t terminal-canvas/lane:1 --build-arg AGENT_UID=$(id -u) docs/streams/vm-lane
```

- [ ] The build succeeds and `container image list` shows `terminal-canvas/lane:1`.

## 2. The probe

Open the palette, `Environment…`.

- [ ] The row reads `Sandboxed lanes: Apple container`, and `Check again` after
      `container system stop` reads "installed but not started".

## 3. The network lock, by hand

The app's proxy is not needed to prove the lock fails closed:

```sh
container run --rm --cap-add NET_ADMIN -e TC_VM_PROXY=192.168.64.1:9 terminal-canvas/lane:1 \
  sh -c 'curl -sS -m 5 https://example.com && echo LEAKED || echo BLOCKED'
container run --rm terminal-canvas/lane:1 true; echo "exit $?"   # no NET_ADMIN, no TC_VM_PROXY
```

- [ ] The first prints `BLOCKED` (nothing leaves but the proxy's address).
- [ ] The second exits 70 with `TC_VM_PROXY is not set` — the agent never starts.
- [ ] The same over IPv6, if the VM has a v6 address: `curl -6 -sS -m 5 https://example.com` prints nothing and fails
      (or the entry refuses with `IPv6 is routable here and could not be locked`).
- [ ] `--entrypoint /usr/local/bin/tc-vm-entry` is honoured by `container run`, and an image
      without that file fails to start rather than running the agent.
- [ ] `-e NAME` with no value inherits `NAME` from the `container` client's environment
      (the model token and the proxy URL depend on it): `FOO=bar container run --rm -e FOO alpine sh -c 'echo $FOO'` prints `bar`.
- [ ] `iptables` works in Apple's VM kernel at all (if the first command prints
      `iptables is not usable here`, the lock needs another mechanism; stop here
      and record it).

## 4. A sandboxed auto run

Settings: turn on **Sandboxed lanes**; set the allowlist to `registry.npmjs.org`.
Make a throwaway git worktree, open a chat in it, then palette → `Auto, sandboxed: Custom…`
with the task "create hello.txt containing hi, then run `npm view left-pad version`".

- [ ] The chat's header shows `sandboxed`, and `container list` shows `tc-lane-<id>` while it runs.
- [ ] No permission question appears (prompts off) and `hello.txt` lands in the worktree, owned by you.
- [ ] Nothing outside the worktree changed (`ls ~` before and after; `~/.claude` untouched).
- [ ] Inside the worktree, `.git` and `.claude` are read-only: ask the agent to
      `git config core.fsmonitor 'touch /tmp/x'` and to write `.claude/settings.json`; both fail.
      (Its work stays uncommitted in the worktree; the morning queue reviews it.)
- [ ] `~/Library/Application Support/<app>/vm-lanes/egress.jsonl` lists `api.anthropic.com`
      and `registry.npmjs.org` as allowed. Ask the agent to `curl https://example.com`: it fails,
      and the log has `example.com` as refused.
- [ ] When the run resolves, the `sandboxed` label goes, `container list` is empty, and the
      chat's next message runs on the Mac again (a permission question comes back).
- [ ] Stop a run halfway (`Stop auto`): the VM is gone within a few seconds.
- [ ] Quit the app mid-run: no `tc-lane-*` VM is left (`container list --all`).

## 5. A checked night

Two tasks on the board with a recipe check (`test -f hello.txt`); palette → `tonight sandboxed`.

- [ ] Each task runs in its own VM in turn, its check runs in a `…-check` VM, and the
      morning queue shows `checked`.

## 6. Docker or OrbStack

Repeat 2–4 with Apple's `container` stopped, after `docker build -t terminal-canvas/lane:1 docs/streams/vm-lane`.

- [ ] The proxy is reached as `host.docker.internal`, and the same results hold.

## Results

| Date | Mac / macOS | Runtime | Sections passed | Notes |
|---|---|---|---|---|

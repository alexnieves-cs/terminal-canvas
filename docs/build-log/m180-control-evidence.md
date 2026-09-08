# M180 — control admission red evidence

Before source implementation, the scoped additions in `scripts/verify-control.cjs` ran on
2026-09-08 with this repository-local command:

```sh
env TMPDIR=/Users/alexnieves/Documents/terminal-canvas/out/t TMUX_TMPDIR=/Users/alexnieves/Documents/terminal-canvas/out/t CFFIXED_USER_HOME=/Users/alexnieves/Documents/terminal-canvas/out/h GIT_CEILING_DIRECTORIES=/Users/alexnieves/Documents/terminal-canvas/out/t TC_VERIFY_SUFFIX=v9 node scripts/verify-control.cjs
```

Exit **1**, **16/25 passed**. All 25 assertions reached the tally; none threw or skipped.
The nine new reds were `plan.protocol.1`–`.5`, `plan.url.1`, and `plan.handler.1`–`.3`.
The existing fifteen checks and `plan.protocol.6` (raw `command`/`args` refusal) passed.
The parser answered `unknown verb "plan"`; the missing handler arm returned no answer and
did not call the injected executor. The async check also observed that it settled before
the renderer answered.

The checks require `parseControlLine(JSON.stringify({ verb: 'plan', line }))` to return
`{ kind: 'ok', req: { verb: 'plan', line } }`, with no carried acknowledgement. They cover
absent/malformed/blank lines, exactly 8192 UTF-8 bytes versus 8193, sixteen operations versus
seventeen, CR/LF/NUL/ESC/DEL, and the existing raw-command refusal. Handler injection is
`plan?: (line: string) => Promise<{ kind: 'ran'; summary: string } | { kind: 'refused'; reason: string } | null>`.
A run returns `{ ok: true, summary }`; refusal preserves the reason as `{ ok: false, error }`;
an absent bridge, null answer, or rejected request returns a named refusal. Main must await
the one executor call and must not invoke its own spawn/focus dependencies.

Reading the parser found a pre-existing URL override: `parseControlUrl` checks the `open`
host, then copies query fields over `fields.verb`. Against the pre-implementation bundle,
`terminal-canvas://open?verb=status` returned `{ kind: 'ok', req: { verb: 'status' } }`.
Once admitted, `plan` would take the same route. `plan.url.1` therefore requires both the
direct plan host and `open?verb=plan&line=…` to refuse by the open-only URL boundary, not by
an incidental unknown-verb error.

This evidence covers transport admission and handler mapping only. Renderer execution and
destructive-plan refusal, the full verification chain, visual and packaged checks remain
with the milestone owner.

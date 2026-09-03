import { AGENT_CAPABILITIES, type AgentOptions } from '@shared/cost'
import type { PanelSpec } from '@shared/types'

/**
 * The argv a spec's agent knobs add, lifted out of `PtyManager.create()`.
 *
 * PURE, and in its own module for the reason `tmux-args.ts` is: an argv
 * builder that imports neither `node-pty` nor `electron` can be checked in a
 * cheap tier with no real `claude` anywhere on PATH. A check that shelled out
 * to a real one would skip on every machine without it and quietly stop
 * existing — the failure `verify:review`'s loud-skip rule already names.
 *
 * Two rules it inherits from the `--session-id` block it grew out of, and
 * neither is optional:
 *
 * 1. GATED ON `spec.agent`, NEVER ON THE KNOB. Appending a flag to a command
 *    the user typed is the move `resolveCommand` deliberately refuses, and a
 *    knob set on a login-shell panel must therefore emit nothing at all.
 * 2. A USER-SUPPLIED FLAG WINS, per flag. `claude` rejects a duplicated flag
 *    outright rather than ignoring it, so a second `--permission-mode` does
 *    not override anything — it stops the panel starting at all.
 *
 * The per-agent spellings live in `AGENT_CAPABILITIES`, so a Claude option can
 * never leak into Codex argv (or vice versa).
 */
export function agentArgs(
  spec: Pick<PanelSpec, 'agent' | 'args' | 'agentOptions'>,
  sessionId: string
): string[] {
  // Rule 1. Not `if (spec.agentOptions)` — see the comment above.
  //
  // Returned AS IS, never copied. This is a faithful extraction of create()'s
  // own `let args = spec.args`, and the fidelity is load-bearing: a caller may
  // omit `args` entirely (verify-panels.cjs does, deliberately), where the old
  // line bound undefined harmlessly and a spread throws
  // "spec.args is not iterable" from inside an async create() — an unhandled
  // rejection that takes the whole suite down before its first check prints.
  // Caught exactly that way; the copy was a real regression, not a tidy-up.
  if (spec.agent === undefined) return spec.args

  let args = [...spec.args]
  const append = (flag: string, value: string): void => {
    // Rule 2.
    if (args.includes(flag)) return
    args = [...args, flag, value]
  }

  const capability = AGENT_CAPABILITIES[spec.agent]
  // M74. A `--resume <id>` in the args NAMES the session; a `--session-id`
  // beside it is a contradiction the CLI refuses outright, and the pin would
  // name a transcript that never exists while the real one grows. The pin
  // itself follows the resume in PtyManager.create.
  const resumes = args.includes('--resume')
  if (capability.sessionIdFlag !== undefined && sessionId !== '' && !resumes) {
    append(capability.sessionIdFlag, sessionId)
  }

  const options: AgentOptions = spec.agentOptions ?? {}
  // Iterated over this agent's flags rather than written out at each call
  // site, so unsupported saved fields remain inert instead of breaking a
  // launch with a foreign CLI flag.
  for (const key of Object.keys(capability.flags) as (keyof AgentOptions)[]) {
    const value = options[key]
    const flag = capability.flags[key]
    if (value !== undefined && flag !== undefined) append(flag, value)
  }

  return args
}

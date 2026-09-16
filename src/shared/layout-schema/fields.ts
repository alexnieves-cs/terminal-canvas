/**
 * The three type guards the readers share, and the FIELDS that appear on more
 * than one kind of record.
 *
 * `parseAgentOptions`, `parseEnvMap` and `parseWorktreeFlag` are here rather
 * than beside either caller because a panel and a preset carry the same three
 * fields: two parsers for one format agree on the day they are written and
 * drift the first time only one is edited (the note on parseWorktreeFlag says
 * it in full). `parseFlag`, `parseTemplateBinding` and `parseMaximised` are
 * PersistedPanelBase's fields, shared by every kind.
 *
 * Nothing here is re-exported from ../layout-schema.ts except the three agent
 * fields, which already had callers outside this file. The guards stay
 * internal: a guard on the public surface is one four modules start depending
 * on before anyone decides it should be public.
 */

import {
  CODEX_APPROVAL_POLICIES,
  CODEX_SANDBOXES,
  EFFORTS,
  MODEL_PATTERN,
  PERMISSION_MODES,
  type AgentOptions,
  type CodexApprovalPolicy,
  type CodexSandbox,
  type Effort,
  type PermissionMode
} from '../cost'

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const isStr = (v: unknown): v is string => typeof v === 'string'

/**
 * M37. The worktree flag a panel or a preset carries, ONE function for both
 * parsers for parseAgentOptions's reason: two parsers for one format agree on
 * the day they are written and drift the first time only one is edited.
 *
 * Absent → absent. `true` → true. A present `false` is a well-formed "no" and
 * reads as absent with no warning, so a file that spelled it out is not
 * shouted at. Anything else drops the FIELD with a warning naming the record,
 * never the record — parseLayout's individual-drop rule one level down.
 */
/**
 * M147. An environment override map: a record of string values, or nothing.
 * Present-but-malformed drops the WHOLE map with a warning — never a partial
 * one — and the record it sits on survives.
 */
export function parseEnvMap(raw: unknown, label: string, warnings: string[]): Record<string, string> | undefined {
  if (raw === undefined) return undefined
  // A key is what the sheet's own parser accepts (`parseEnvLines`): no
  // whitespace, no `=`, not empty. One rule for the file and the form — the
  // first cut let a hand-edited `"A B": "1"` through to the process unwarned.
  if (!isRecord(raw) || Object.values(raw).some((v) => typeof v !== 'string') || Object.keys(raw).some((k) => k.trim() === '' || /[\s=]/.test(k))) {
    warnings.push(`${label} had a malformed env map; dropped it whole`)
    return undefined
  }
  return { ...(raw as Record<string, string>) }
}

export function parseWorktreeFlag(raw: unknown, label: string, warnings: string[]): boolean {
  if (raw === undefined || raw === false) return false
  if (raw === true) return true
  warnings.push(`${label} had a malformed worktree flag; dropped it`)
  return false
}

/**
 * The agent knobs a panel or a preset carries, validated per FIELD.
 *
 * ONE function rather than a block pasted into parsePanel and parsePreset,
 * because two parsers for one format agree on the day they are written and
 * drift the first time only one of them is edited — the copy-paste-one-of-two
 * this file's shape invites, and the exact gap M17's fix round found when
 * Preset.agent was guarded and PanelSpec.agent was not.
 *
 * Every arm drops the FIELD and keeps its siblings, never the whole record and
 * never the whole panel: that is `parseLayout`'s individual-drop rule applied
 * one level down, and for mode and effort it also fails SAFE, since the CLI's
 * own default is more restrictive than any value we failed to recognise.
 *
 * Returns undefined when nothing valid survives, so an absent record is never
 * spelled `{}` — `'agentOptions' in preset` has to keep answering false for a
 * preset that never carried one.
 */
export function parseAgentOptions(
  raw: unknown,
  label: string,
  warnings: string[]
): AgentOptions | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    warnings.push(`${label} had a malformed agentOptions; dropped it`)
    return undefined
  }
  const { permissionMode, effort, model, sandbox, approvalPolicy } = raw
  const out: AgentOptions = {}

  if (permissionMode !== undefined) {
    if (isStr(permissionMode) && (PERMISSION_MODES as readonly string[]).includes(permissionMode)) {
      out.permissionMode = permissionMode as PermissionMode
    } else {
      warnings.push(`${label} named an unknown permissionMode; dropped that field`)
    }
  }

  if (effort !== undefined) {
    if (isStr(effort) && (EFFORTS as readonly string[]).includes(effort)) {
      out.effort = effort as Effort
    } else {
      warnings.push(`${label} named an unknown effort; dropped that field`)
    }
  }

  if (model !== undefined) {
    if (isStr(model) && MODEL_PATTERN.test(model)) {
      out.model = model
    } else if (isStr(model) && model.startsWith('-')) {
      // Its OWN warning, deliberately not merged into the generic malformed
      // one below. There is no shell on this path, so this is not injection —
      // args reach node-pty as an argv array and tmux execs the multi-argument
      // new-session form directly. The surface is `claude`'s own parser: a
      // leading dash makes the value a FLAG rather than --model's operand, and
      // layout.json and presets are both shareable artifacts. Someone reading
      // a log after a surprising spawn needs to see that distinction.
      warnings.push(
        `${label} gave a model that looks like a flag (${model}); dropped that field`
      )
    } else {
      warnings.push(`${label} gave an unusable model; dropped that field`)
    }
  }

  if (sandbox !== undefined) {
    if (isStr(sandbox) && (CODEX_SANDBOXES as readonly string[]).includes(sandbox)) {
      out.sandbox = sandbox as CodexSandbox
    } else {
      warnings.push(`${label} named an unknown sandbox; dropped that field`)
    }
  }

  if (approvalPolicy !== undefined) {
    if (isStr(approvalPolicy) && (CODEX_APPROVAL_POLICIES as readonly string[]).includes(approvalPolicy)) {
      out.approvalPolicy = approvalPolicy as CodexApprovalPolicy
    } else {
      warnings.push(`${label} named an unknown approvalPolicy; dropped that field`)
    }
  }

  return out.permissionMode === undefined && out.effort === undefined && out.model === undefined &&
      out.sandbox === undefined && out.approvalPolicy === undefined
    ? undefined
    : out
}


/** M92. A boolean flag on a panel record: true, absent/false as absent, else warned and dropped. */
export function parseFlag(value: unknown, name: string, id: string, warnings: string[]): boolean {
  if (value === undefined || value === false) return false
  if (value === true) return true
  warnings.push(`dropped panel ${id}'s ${name}: ${JSON.stringify(value)} is not true or false`)
  return false
}

/** M182. `{ templateId, key }`, both non-empty strings; anything else present warns by id and costs the field. */
export function parseTemplateBinding(value: unknown, id: string, warnings: string[]): { templateBinding?: { templateId: string; key: string } } {
  if (value === undefined) return {}
  if (isRecord(value) && isStr(value.templateId) && value.templateId.trim() !== '' && isStr(value.key) && value.key.trim() !== '') {
    return { templateBinding: { templateId: value.templateId, key: value.key } }
  }
  warnings.push(`dropped panel ${id}'s templateBinding: it was not { templateId, key }`)
  return {}
}

export function parseMaximised(value: unknown, id: string, warnings: string[]): { maximised?: { restore: { x: number; y: number; w: number; h: number } } } {
  if (value === undefined) return {}
  const restore = isRecord(value) ? value.restore : undefined
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  if (isRecord(restore) && num(restore.x) && num(restore.y) && num(restore.w) && num(restore.h)) {
    return { maximised: { restore: { x: restore.x, y: restore.y, w: restore.w, h: restore.h } } }
  }
  warnings.push(`dropped panel ${id}'s maximised: its restore rect is not four finite numbers`)
  return {}
}

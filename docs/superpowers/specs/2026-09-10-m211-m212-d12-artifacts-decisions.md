# M211–M212 — D12 artifact provenance and accepted decisions

## Decision

An artifact reference is immutable evidence attached to an existing record, not a
new canvas kind. M211 adds it first to image panels: an ordinary image keeps its
mutable title and local path, while optional provenance says whether it came from
an app capture, a file, or a tool result. A capture carries its capture identity
and source URL. Missing bytes remain the image node's existing named arm; a stale
source is never silently rewritten from the title.

M212 makes remembering an assistant answer an explicit, previewed action. The
person sees the exact proposed text and the repository-memory scope, then confirms
the existing `decided` write. The memory store records the source conversation,
turn and known task, acceptance time, and redaction count. It does not claim that
model-generated text is established knowledge before that confirmation.

## M211 — preserve artifact provenance

- `artifact` is optional for old image records. A malformed optional artifact is
  dropped with a warning while its image stays available; unknown source kinds are
  not guessed.
- A capture uses a stable capture id, its URL and its image's app-owned path.
  Renaming the panel never changes this provenance.
- File and tool references are represented by identity and source only. Their
  availability is computed when read; no file bytes, tool output, or secrets are
  copied into layout.

## M212 — accept decisions deliberately

- Only assistant text rows offer **Remember as decision**. Choosing it shows the
  exact text and target scope before any write; Cancel writes nothing.
- Confirming uses the existing main-owned memory store and its existing outbound
  scrubber. The row writes `kind: decided`, source conversation/turn and, where a
  dispatched lane names one, the work-item id. The store timestamps acceptance.
- Repository memory, teammate memory, vault documents and task records remain
  separate scopes. This work links a decision to its task; it never copies it into
  a task record or vault document.

## Boundaries

No new panel kind, no transcript copying, no automatic acceptance, no direct
renderer file access, no source-log resurrection, and no change to asset bytes or
export redaction policy. A missing image or expired transcript is named by the
existing read arms rather than fabricated as available provenance.

## Acceptance

After a panel rename and restart, a capture still identifies its URL and capture
id. A remembered decision identifies the conversation and turn it came from,
states when it was accepted, is redacted before persistence, and does not exist
until the person confirms the shown text and scope.

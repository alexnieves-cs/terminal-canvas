# M89 — The connector seam

**Branch:** `m89-integrations`. **Spec:** `docs/superpowers/specs/2026-09-04-m89-integrations-design.md`.
**Plan:** `docs/superpowers/plans/2026-09-04-m89-integrations.md`. **Status:** finished 2026-09-04.

**Thesis sentence:** every service this app can reach, on one page, each saying whether it is
connected, as whom, what to do when it is not — and what the agents did with it.

## What landed

- `renderer/shell/integration-model.ts` (pure): one row per declared service, three closed
  states with the rejection mark outranking a verified date, one verb, the audit rows under
  each service newest first and capped. `verify:rail integrations.1`.
- `rejectedAt` on `CredentialMeta`, set by `markRejected` from BOTH verify paths (GitHub's and
  Jira's) on a 401/403 and cleared by omission on the next success; absent stays absent
  through the store's read and write. `verify:credentials rejected.1`.
- `broker:audit` — the first reader of the broker's audit — in the contract and both diagrams;
  `verify:ipc` at 92.
- The Integrations pane: the navigator's fifth (`shell.navigator` gains `integrations`), one
  section per service with the sentence in its tone, one verb (`Connect…` / `Verify` /
  `Reconnect…`), the rows beneath with a named empty arm, the skipped count, and a note saying
  what the audit does not show. `verify:panels integrations.1`.
- The palette's `Manage integrations…` door, entering the Credentials scope; `REASON_NO_GITHUB`
  is `notConnectedReason('github')` by import. `verify:palette integrations.1`.
- An `integrations` shot scene. Documents: README row, CLAUDE.md note and counts, load-bearing
  entries, the dead-end audit's page entry.

## What the two services do not share, stated

Jira's credential is a bundle and GitHub's a token (the page shows `as <label>` for both);
Jira has transitions and comments and GitHub has none here (the page lists calls, not verbs);
Jira's panel reads Jira directly while GitHub's panel reads through the broker (the page says
so in its note: only agents' calls to Jira, and every GitHub read, appear).

## Red first

- All four checks red before the model, the mark, the channel and the pane existed;
  `integrations.1` in the panels suite then red once on the harness's own fixture order
  (an earlier block removes the credential directory) — recreated in the block.

## The visual loop

See the triage below.

## Verification

`npm run verify` run alone after the verify tmux server was killed: `verify:credentials`
17/17, `verify:rail` 159/159, `verify:palette` 124/124, `verify:jira` 15/15, `verify:panels`
297/297, `verify:ipc` 92 channels; the chain's exit code 0, recorded from the run, and the
`integrations` scene re-shot after both triages.

## One commit with M88

See M88's log: the seam and the panel it was derived from share one commit.

A harness lesson worth its own line: the panels suite's credential store is SHARED across
blocks, and an earlier block's leftover github credential flipped this pane's verb from
`Connect…` to `Verify` under the check's click; the verify then failed offline and opened the
palette unscoped, which read as "the Connect verb opens no scope". Diagnosed by logging every
palette open with its caller. The block now clears the store first.

## Triage: the critic

**Accepted and fixed.** `refused — refused` on a row whose reason was the word itself (printed
once when they agree; the shot's fixture now carries a real reason). The `who` column named a
panel id (it names the panel's honest label, or `this app`). A POST path was cut from the right
where its last segment said what the agent did (paths wrap). `tc api jira …` could not be told
from an overflow (`tc api jira <path>` in mono). Green and red painted whole sentences (only
the state word carries a tone). The sentences sat in the mono face, and the rejected one named
a second door beside its verb (UI face; the verb is the door).

## Triage: the verifier

Verdict: delivered with gaps. **Accepted and fixed:**

- **`broker:audit` passed each JSONL line through verbatim.** Field by field now; an extra key
  never crosses. `verify:credentials rejected.1`.
- **A recorded path could carry an agent-typed secret.** Scrubbed of every derived form.
- **A 403 at verify time marked the token rejected**, sending the user to replace a token that
  was fine. Only a 401 marks — and the broker marks on a 401 too, from the one place every
  service call passes, so a panel and the page cannot disagree about one token.
- **The `reading…` arm was dead and a failed read read as `no calls yet`.** The audit read has
  three states of its own.
- **A busy service could push another's rows out of the window.** One read per service.
- **A never-verified token read `connected as GitHub`.** The fourth state, `stored`.
  `verify:rail integrations.1`.
- **A timer raced a fifteen-second verify.** The verify's own answer, then the reload.
- **Duplicate React keys on same-millisecond rows.** Indexed.
- **The Jira door still vanished without a credential**, and the Jira client's sentence was its
  own. Present, disabled, and the shared sentence.
- **`Manage integrations…` counted stored tokens as connected.** Verified and not rejected.

**Declined, with reasons.** *A Verify from the page for a rejected token:* `Reconnect…` opens
the Credentials scope, whose rows carry Verify; one door. *Marking on a panel-observed 403:*
a 403 is not a rejection anywhere now. *The fixture's Jira `who` being an email:* the store
writes Atlassian's display name; the check's premise was cosmetic and stands as a fixture.

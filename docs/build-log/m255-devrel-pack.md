# M255 — packs, Phase B: the dev-relations pack, and no GitHub write without a person

Spec: `docs/superpowers/specs/2026-09-10-m255-devrel-pack.md`.
Plan: `docs/superpowers/plans/2026-09-10-m255-devrel-pack.md`.

Branch `packs-b`, off `packs-11` (M253). The user's choices:
- all four actions: release notes, changelog entries, PR comments, announcement drafts;
- announcements on GitHub itself;
- shipped as a sample `.tcpack`.

## What was wrong first

Before M255, the broker asked a person before a write only when a teammate's chat was the
caller. So a terminal, a workflow's chat node or a bare `tc api` could POST to GitHub or Jira
with no one asked. One "Allow for session" on a `github` card approved every later write from
that chat. No request body passed `outward()`. The user chose to close this here.

## What landed

- **`main/broker.ts`.** A non-read-only request needs a teammate's per-request card or
  `personConfirmed: true`. Anything else is refused `not-asked`, before the credential is read.
  `brokerCardTool` mints a per-request card name, so a session grant answers only its own write.
- **`main/github-publish.ts`.** `publish` handles a release, a PR comment or a Discussion from a
  draft file, in this order:
  1. the repository comes from the draft's own origin;
  2. the title is the first `# heading`;
  3. the body and title pass `outward()`;
  4. the system's own confirm (default Cancel) asks every time. It shows the opening lines and
     says how many it did not show;
  5. only then is the broker called, with `personConfirmed`.

  The Discussion's GraphQL lookups run after the confirm. `parsePublishRequest` refuses a
  malformed request by name.
- **IPC.** `github:publish` and `pack:sample`.
- **Verbs.** `publish-release`, `publish-comment` and `publish-discussion` are destructive,
  refused to teammates, and refused outright at the plan door. `sample-pack` is new too.
- **Palette rows.** Three publish rows on the selected draft file, disabled by name until
  exactly one panel is selected, plus "Import the sample dev-relations pack…".
- **`shared/devrel-pack.ts`.** The one source of `docs/packs/dev-relations.tcpack` and of the
  userData copy. It holds:
  - four drafting workflows (release notes, changelog entry, release announcement, PR comment);
  - four prompts;
  - two read-only presets.

  It requires the GitHub token, `gh` and `git`, and carries no GitHub write on any executable
  surface.

## Evidence

- **Watched RED first, then GREEN:**
  - `verify:credentials scope.1`: changed on purpose; it used to assert that the teammate-less
    write went through.
  - `broker.gap.1`, `broker.gap.2`
  - `verify:github publish.1–.6`
  - `verify:file devrel.pack.1–.2`
- **Written as guards:**
  - `verify:control control.gap.1` passed on first run: `tc api` already built its broker
    request field by field. It guards against a spread.
  - `publish.7` (the critic's observation) was written with its fix.
- **End to end:** `verify:panels:product devrel.1`, `pack.import.1` and `pack.import.2` pass 3/3
  under `/tmp/tc-electron-lock` (2026-09-10 23:08). What `devrel.1` observed:
  - the preview showed "Add 10 objects" and the GitHub need, and the add stored 4 unread
    workflows, 2 unread presets and 4 prompts;
  - the plan door refused the publish;
  - a cancelled publish asked once, "Publish a GitHub release v9.9.9 to acme/canvas?", and made
    zero broker calls;
  - a confirmed publish made exactly one `POST /repos/acme/canvas/releases` with
    `personConfirmed`, and the harness broker's refusal came back as `unavailable`.
- **Its first run was red on a check defect,** not a product one: it held `layoutStore.current()`,
  the live snapshot, as its "before". It now copies ids at capture.
- **Plain-node suites:** the affected ones are green (file, layout, verbs, meta, palette, styles,
  credentials, control, github, agent-session, rail, registry). `verify:ipc` is pinned at 140.

## The critic

A fresh-context review of 750e3e81 found **no path for an unconfirmed GitHub write**. It
confirmed:
- `not-asked` fires before the read;
- `tc api` cannot forward `personConfirmed`, and the publisher is its only setter;
- per-request card names defeat session grants (exact-string `Set.has`);
- the GraphQL lookups run after the confirm;
- the title shown is the title sent;
- the board flows are untouched;
- plans and workflow action nodes are refused;
- the dialog defaults to Cancel and fails closed with no window.

Its one lower-confidence observation was that the confirm shows 8 lines while the whole body is
sent. It is fixed: the confirm names the lines it did not show and the file to read them in
(`publish.7`).

## Owed

- **By hand:** one real release, PR comment and Discussion against a scratch repository.
  `npm run verify` stays offline.
- **A canvas control on the file panel itself for the publish verbs** (M256). The palette row on
  the selected draft is the person's door.
- **The full `npm run verify` gate after merging main.** Main gained `packs-11`, deck, pill and
  notes after this branch's base, and `gate.2` and `EXPECTED_CHANNELS` re-pin on that merge.

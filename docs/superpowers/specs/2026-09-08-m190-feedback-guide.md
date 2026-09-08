# M190 — the feedback door and the getting-started guide

Act VII of the v9 run (the plan's M197 row). The 5.0 brief: *"Feedback opens a scrubbed browser
draft the person can inspect and submit."*

## Feedback is a DRAFT, never a submission

`shared/feedback.ts` builds the issue text from facts this app already has — the version, the
platform, the engine readiness rows (installed / missing / unanswered, never a token and never a
path outside the app's own), the panel kinds on the canvas as COUNTS, and the person's own
sentence. Every string passes `redactSecrets` and the count is stated in the draft itself, so
what was scrubbed is visible to the person before they send anything.

The door opens the repository's `issues/new` URL with the body as a query parameter, through
`link:open` — the same one door every other outward link takes. Three things follow and each is
the point: this app posts NOTHING (no credential is read, no broker call is made, and
`verify:verbs` counts the credential-store readers unchanged); the person sees the draft in
their own browser and edits or abandons it; and if the body is longer than a URL can carry, the
draft is TRUNCATED with a line saying so rather than silently cut.

## The guide

`docs/getting-started.md` is written from the shipped behaviour: install and the Gatekeeper
right-click, the first conversation, the starter canvas, the canvas gestures, the palette and
the verb line, workflows and Test this node, the preview, pictures and notes, export and import,
and what a person still has to do themselves. It is checked as a FILE by `verify:meta`
(`guide.1`): it exists, it names the Gatekeeper step, and every `npm run` command it mentions is
one `package.json` actually has — a guide that names a script that does not exist is worse than
no guide.

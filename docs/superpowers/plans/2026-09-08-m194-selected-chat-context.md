# M194 implementation plan

1. Add scoped behavior checks to the existing product suite; watch new assertions fail
   without aborting later checks. Add pure policy coverage where useful to distinguish kinds.
2. Implement the shared directory policy, subject-bound Files and Tools reads, truthful
   refusal copy, and chat support in Open toolbox. Preserve DOM aliases and session lifetimes.
3. Check main's Toolbox directory without spawn fallback and preserve unavailable results
   through its existing consumers. No dependencies are added.
4. Run targeted suites then `npm run verify`. Obtain fresh-context critic/verifier review,
   fix findings, inspect affected captures, record intended golden changes before updating.
5. Run visual and packaged gates, record exit codes/tallies/manual gaps, update the v10
   ledger and guide. Keep existing D01 edits intact; create no remote objects and push nothing.

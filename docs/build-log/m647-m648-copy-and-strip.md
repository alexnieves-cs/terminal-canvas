# M647–M648: the copy without hanging clauses, and the terminal strip

Lane W follow-up to the unslop pass (M646). The run's state is in the
[m457–m509 ledger](m457-m509-ledger.md); this file is what each milestone found.

## M647. Copy written as sentences

M646 rewrote the first-run copy. The estimate for what was left was about 270
strings; a scan of every string, template and JSX text literal in
`src/renderer` and `src/shared` that holds an em dash found about 1,400 lines
in 232 files. Each was rewritten by its shape:

- a lower-case refusal with a fix after it takes a semicolon
  (`nothing to save; the diagram matches the template`);
- two sentences take a full stop, and the second is capitalised;
- a label and its description take a colon;
- a trailing aside (`— not on PATH`) takes brackets;
- a clause that was a reason or a result takes `, so` or `, because`.

Setting descriptions stay one lower-case sentence with no full stop
(`verify:palette voice.1`), so theirs take a semicolon.

**Records already on disk.** Three sentences are read back by code: a
handoff's `queued:` and `joined: ` result, and a lane card's refused first
send. Each reader accepts the dash form too, because a canvas saved by an
older build still holds it.

**Left as they are, on purpose.** Agent prompts (what an agent reads, not a
person), layout and flowchart parse warnings, the verb table's internal door
reasons, title separators (`panel-name.ts`, the far title), the lines other
code splits on `' — '` (`describePlan`, the review banner, the launcher
subtitle), and every string in `src/main` and `src/cli` but one: the preview
capture refusal, which the renderer states too. Those are a possible next pass.

Checks that pinned the old wording were re-pinned to the new; where a pinned
phrase now opens a sentence, its regex is case-insensitive.

## M648. The terminal strip at 100%

At rest the strip was fixed in M641 (name and state only). Shown (hovered,
focused or selected) on a 476px terminal at 100% it read `Claude — l…`,
`…/steward/…`, `feature/…`, `ledger-ex…`, and a state pill squeezed to its
4ch floor (`( w`). The pill kept M410's flex-shrink of 100, which was for a
state that is a sentence, so it gave way before anything else.

Now the word does not shrink (its 22ch cap still bounds a sentence), and the three contextual facts give way
first and leave whole rather than as fragments, by a container query on the
strip: the agent line below 760px, the path below 620px, the branch below
460px. The order is how much each repeats the name. The name's tooltip still
carries the command and the full working directory. The strip is absolutely
positioned outside the body, so nothing refits xterm.

Looked at in the web demo at 100%: `Claude — ledger-export`,
`feature/csv-export`, `working · 1s`, then the controls.

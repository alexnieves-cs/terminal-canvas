# M70 — Ship 1.1.0

**Status:** decided 2026-09-03. **Branch:** `m70-ship`.

## What this milestone is

The close of the second run: the version, the documents, the two packaging gates run with
their numbers written down, the graph refreshed. No feature.

## Design

- `package.json` and the README status line say `1.1.0`; `verify:meta version.1` pins both.
- README gains **What it looks like**: three of the harness's scenes described in words
  (the PNGs are not tracked — `npm run shot` regenerates them from the tree in a minute).
- CLAUDE.md's "What this is" names 1.1 (M70) and the second run in one paragraph.
- `docs/load-bearing.md` gains the two M69 rules and one manual-only bullet: every pixel
  is manual; M61's harness renders, it does not assert. No item was struck.
- Backlog #33 joins the Gone table.
- `npm run package` and `npm run verify:packaged`, numbers in the build log.
- `graphify .` (full) if an LLM key is present, else `graphify update .` (AST only), and
  the log says which ran.

## Definition of done

`npm run verify` green alone; the package built; the packaged gate green; merged.

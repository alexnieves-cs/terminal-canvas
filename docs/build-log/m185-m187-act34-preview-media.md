# Acts III and IV — the preview and the media (M185–M187)

The v9 run's third and fourth acts, built together on `v9-act3-preview` and `v9-act4-media`
(the second branched from the first, so one `--no-ff` merge carries both). Their ledger lines,
with the specs, the red-first evidence, M185's critic and every disposition, are
`docs/build-log/m180-m200-ledger.md` under `## M185`, `## M186` and `## M187`.

Both acts answer one paragraph of the 5.0 brief — *"Preview and media"* — and they are two acts
rather than one because the preview is about a process this app does not own, and the media is
about bytes it does.

## What the acts are

- **M185, the preview.** Discovery names the project and the source of its answer and EXECUTES
  NOTHING: one `lsof` over the panel's process tree, one `package.json`, and a dev script that
  is offered rather than run. Four states, not two — not-asked, none, one, many — because
  "there was nothing to ask" and "nothing answered" have different fixes. Device widths are
  named presets that LAY the guest out (never a transform, which would report the pane's
  viewport to the page). Capture is a real guest screenshot, refused by name on a page that is
  not http(s), on an empty image and on a write that fails, and it lands as an ordinary image
  object. A file change reloads only a pane showing a loopback host, coalesced, without
  rebuilding the guest.
- **M186, the store.** One content-addressed asset store: the id is a sha-256 of the bytes, so
  the same picture twice is one file and an id is a fact an export can carry to another machine.
  Both caps are reported; the extension follows the magic number and never the name. A drop or
  a paste that lands on NOTHING becomes a picture — every existing agent target keeps its
  behaviour exactly — and Replace repairs a picture whose bytes are gone through the system's
  own chooser.
- **M187, the objects.** Sticky notes, free text and named frames as one kind with three forms,
  equal to every other object in selection, drag, resize, marks, grouping, undo, tiering and
  export by construction. A frame is minted behind what it encloses and its interior takes no
  gesture.

## The three commands

Run on `v9-act4-media` at `af06120`, in the environment `out/v9-evidence/run-electron.sh` sets.

| Command | Exit | Result | Log |
|---|---|---|---|
| `npm run verify` | 0 | every suite's tally, no FAIL line | `out/v9-evidence/act34-verify.log` |
| `npm run verify:visual` | 0 | 59/59 | `out/v9-evidence/act34-visual.log` |
| `npm run verify:packaged` | 0 | 12/12 | `out/v9-evidence/act34-packaged.log` |

## What these acts owe

- The workflow door of the four-door rule is still data: every v9 verb's `V9_DOORS` row names
  `WORKFLOW_EXECUTOR_DUE` (M188) with its reason, and `closure.v9.1` compares against that one
  constant rather than a literal.
- A capture's provenance is its panel's TITLE, not a field on the record. M185's critic found
  the spec claiming more than shipped; `image.asset` is the identity that travels, and the
  `from` field belongs to the export milestone where a round trip is the point.
- `hitTest` still names a frame for a drop into its interior: the gesture rule is a DOM fact,
  and drop targeting has six callers.
- A person still owes the timed first-run trial and a real dev server hand check: no suite in
  this repo starts a project's server, by the same rule that keeps the network out of `verify`.

# M244 — object creation and file-backed checklists

The canvas gets a quiet, horizontally scrollable New object row. Native buttons expose
Terminal, Agent, Note, Image, Workflow, Browser/Preview and Checklist in registry order.
Tab, Enter and Space work, with visible focus. Earlier group buttons were mouse-only;
that known defect is not a precedent for this row. No counts belong in the row.

One creatable-object registry beside `V9_DOORS` supplies labels, icon names, creation
callbacks, availability and door metadata. Palette rows, plan verbs and workflow action
nodes use that registry too. Adding a future creatable type requires one entry, not another
switch in each door. Existing main-owned spawn and file/asset/template paths remain the
authority. New objects are centred in the visible canvas; a chooser may collect a filename,
image or URL before creation. Unavailable buttons stay present with a named reason.

## Checklist is a file-note form

A checklist is a structured view of a real Markdown note: `kind: file`, with an optional
`checklist` display field on its source. It is NOT a fourth M187 in-memory `note` form.
This follows product-rules.md's “a note is a Markdown FILE” rule and M27's existing file
view precedent. Its session, path, watcher, CAS writes and disposal are the file panel's.
The name is Checklist in the UI. No PTY, special lifecycle or styling dependency is added.

GFM task lines (`- [ ]` / `- [x]`, also uppercase X) are editable items. Unrecognised prose,
blank lines, fenced code and malformed task-like lines remain byte-for-byte intact.
Absent input, malformed input and a valid document are distinct parser results. Item
operations never regenerate the whole Markdown document from the recognised subset.
Add, toggle, drag reorder and delete each produce an undoable guarded file write;
keyboard move controls provide the same operation. Empty lists show no zero summary;
nonempty lists show a completed/total phrase.

External changes remain the file store's observed answer, separate from the accepted
checklist document. They are presented as a review draft, never silently adopted. The
existing file read/watch and compare-and-swap refusal gate is reused; the checklist adds
an explicit review/accept UI because FileNode itself currently reseeds clean drafts.
Truncated, missing, binary or unreadable files cannot be saved through the checklist.
Undo refuses to overwrite an unreviewed external change.

Hand to agent explicitly selects a conversation panel (including a teammate conversation),
sends the item through the existing agent send/grant gate, and records the association only
after send succeeds. A linked run's state is shown separately from completion: an agent
finishing never automatically checks the item. Missing conversations have a named state.

Portable export retains the checklist view but strips execution associations; import is
inert and requires review of the local file before editing or sending. File contents are
not silently embedded in exports. Text that does travel uses the existing outward scrub.

Verification covers registry/row/verb closure, parser preservation and malformed inputs,
real disk round trips, undo/refusal, external review, keyboard controls and inert import.
Canvas chrome is in the visual register, so the row also receives visual evidence.

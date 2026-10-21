# Streams run: cross-lane requests

Append a request when you need a file another lane owns. One entry each; the
owning lane answers by landing it or saying why not, and edits the status.

Format:

```
### Q-001 · <what you need>
- From: <lane> · To: <lane>
- File: <path>
- Smallest change: <one or two sentences>
- Status: open
```

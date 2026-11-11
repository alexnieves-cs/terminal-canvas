# Third-party notice: Creance

The components in this folder (`ApprovalPrompt.tsx`, `ToolCallCard.tsx`,
`RunTimeline.tsx`) and the run model in `src/shared/agent-run.ts` and the risk
rule in `src/shared/approval-risk.ts` are adapted from **Creance**, an agent
supervision kit for React: <https://github.com/amitshrivastavaa/creance>, taken
at commit `c8bfae4e79bf992d2c55b4a154cd63f062999d2e` (2026-10-14) from
`packages/react/src/organisms/{ApprovalPrompt,ToolCallCard,RunTimeline}`,
`packages/react/src/events.ts` and `packages/react/src/run/reduceRun.ts`.

Creance publishes the same source through its shadcn registry
(`https://creance.pages.dev/r/<item>.json`, built from `main`); it was copied
from the repository because that host is not reachable from the build
environment. The files are now this repository's own source and are changed
to fit it: its tokens and `[data-tone]` state colours instead of Creance's
CSS, its `shellControl` buttons, this app's transcript as the event source, and
"Allow for session" in place of "Always allow". Each file's header says what
was kept and what changed.

Creance is distributed under the MIT License, reproduced here as it requires:

```
MIT License

Copyright (c) 2026 Amit Shrivastava

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

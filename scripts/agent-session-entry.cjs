/* esbuild entry for the agent-session suite (M71). Four modules, each pure or
   injected: shared/transcript.ts imports only a type from @shared/cost;
   main/agent-session.ts takes its process runner, command, environment and
   id minter as dependencies; main/agent-session-args.ts is argv arithmetic
   over main/agent-args.ts; main/quit.ts imports nothing. None of them may
   import `electron` or `node-pty` — if this entry ever needs
   `external: ['node-pty']`, the real claude-cli-runner (child_process, a
   real login environment) has leaked into the manager and belongs back in
   its own module, which is deliberately NOT bundled here. */
module.exports = {
  transcript: require('../src/shared/transcript'),
  /* M90. The codex adapter: codex's JSONL to the same TranscriptEvent union. */
  codex: require('../src/shared/codex-transcript'),
  session: require('../src/main/agent-session'),
  args: require('../src/main/agent-session-args'),
  quit: require('../src/main/quit'),
  /* M73. The durable per-panel transcript file: node:fs against an injected
     directory, the scrollback log's shape. */
  log: require('../src/main/agent-transcript-log'),
  /* M74. The CLI-transcript importer: pure over lines. */
  importer: require('../src/main/claude-transcript-import'),
  /* M74. The TUI argv builder, for the resume rule. */
  agentArgs: require('../src/main/agent-args'),
  /* M75. The attachment resolver: node:fs over a path, pure over data. */
  attachments: require('../src/main/attachments'),
  /* M76. The approval tracker and the badge union: pure over an injected sink. */
  approvals: require('../src/main/approvals'),
  /* M97. The auto modes: pure. */
  auto: require('../src/shared/auto'),
  /* M99. The backend registry, and the capability table derived from it. */
  backends: require('../src/shared/agent-backends'),
  /* M114. ChatSource's carry for the dispatch mark. */
  chatPanel: require('../src/shared/chat-panel'),
  /* M114. DISPATCH_PROMPT lives beside SUPERVISOR_PROMPT in the shared module. */
  sharedSession: require('../src/shared/agent-session'),
  cost: require('../src/shared/cost')
}

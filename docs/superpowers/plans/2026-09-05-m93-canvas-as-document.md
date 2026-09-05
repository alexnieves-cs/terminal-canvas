# M93 plan

1. Red: `verify:layout snap.1/.2`, `annot.1`; `verify:viewport annot.1`.
2. `main/layout-snapshots.ts` (injected dir/now/fs), the store's hook, `snapshot:list`/`snapshot:restore`
   (two invokes: contract + both diagrams + `verify:ipc` count), the restore path with re-minted ids.
3. `shared/annotations.ts`, the workspace record, `AnnotationLayer.tsx`, annotate mode in Canvas, the
   palette rows, the minimap dots, styles.
4. `verify:panels snap.1`, `annot.1`; shot scenes; critic + verifier; build log; docs; chain (read the
   exit line); merge.

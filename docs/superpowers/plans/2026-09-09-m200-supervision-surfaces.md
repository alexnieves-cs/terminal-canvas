# M200 implementation plan

1. Add red-first pure checks for run-row wording and real-renderer checks for workflow and task
   blocker agreement, exact answer targeting, queue reasons and unchanged task disposition.
2. Feed the M199 projection into `WorkflowNode`; show selected-run detail beside the diagram and
   route Allow/Deny through the existing palette action.
3. Project the linked chat onto `WorkNode` and show execution separately from the item-state pill.
4. Change generic completed run wording to `run ended` and node wording to the precise execution
   result.
5. Run targeted suites, `npm run verify`, inspect affected shot scenes, record a critic sentence
   before any required golden update, then run `npm run verify:visual` and
   `npm run verify:packaged` because M200 closes D06.


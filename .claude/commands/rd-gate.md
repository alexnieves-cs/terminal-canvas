---
description: Run gate G1 or G2 via the verify-runner subagent
argument-hint: [G1|G2]
---

Use the verify-runner subagent to run gate $ARGUMENTS for lane $RD_LANE. The verify script is `verify:rd-` plus the lane id in lowercase.

If G2 passes its automated part, run the mockup-critic subagent on each composite the shot run wrote for this lane's rd-* scenes and the rules-reviewer on the diff (plus world-guard if the lane id starts with W).

Summarise: gate result, critic verdicts with the top 3 divergences per scene, reviewer blockers. Do not fix anything in this command; propose the fix list.

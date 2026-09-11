---
description: Diagnose a bug using reproduction and evidence
argument-hint: "[problem]"
---
Diagnose this problem using the following loop:

1. Reproduce it or identify the smallest reproducible case.
2. Separate observed facts from hypotheses.
3. Inspect the relevant implementation and recent changes.
4. Add minimal instrumentation only if needed.
5. Fix the root cause, not only the symptom.
6. Run a regression check.
7. Report cause, fix, verification, and remaining uncertainty.

Do not change code before explaining the likely cause unless the fix is trivial.

Problem:
$@

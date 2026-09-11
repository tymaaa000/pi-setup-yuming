---
description: Review code or a diff for actionable defects
argument-hint: "[scope or focus]"
---
Review the requested code or diff.

Focus on correctness, regressions, security, error handling, concurrency, compatibility, and tests. For every finding include severity, file and line, concrete failure scenario, and recommended fix. Do not report style issues unless they affect correctness or maintainability.

End with:
- blocking findings;
- non-blocking findings;
- tests not performed.

Review scope:
$@

---
description: Implement a requested change with focused verification
argument-hint: "[requirements]"
---
Implement the requested change.

Workflow:
1. Restate the goal and constraints briefly.
2. Inspect relevant files and existing conventions.
3. Identify the smallest compatible implementation.
4. Make only requested changes.
5. Run focused verification.
6. Report changed files, verification, and remaining risks.

Do not refactor unrelated code, add speculative abstractions, modify secrets or generated files, or claim tests passed unless they were actually run.

User requirements:
$@

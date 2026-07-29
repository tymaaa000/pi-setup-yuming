---
description: Diagnose and fix a bug — reproduce, locate, fix, verify
argument-hint: "<bug description>"
---
## Step 1: Reproduce

Understand the bug from `$ARGUMENTS`. If possible, reproduce it:
- Run the relevant code/tests
- Capture the error message or unexpected behavior
- Confirm you can see the failure

## Step 2: Minimize

Narrow down the cause:
- Bisect recent changes if applicable
- Identify the minimal reproduction case
- Isolate the failing component or function

## Step 3: Diagnose

Form a hypothesis about the root cause. Instrument with logging or breakpoints if needed. Validate your hypothesis before fixing.

## Step 4: Fix

Apply the minimal fix. Do not refactor adjacent code. Keep the change surgical.

## Step 5: Verify

- Confirm the original bug no longer reproduces
- Run existing tests to check for regressions
- If tests don't exist for this path, mention it

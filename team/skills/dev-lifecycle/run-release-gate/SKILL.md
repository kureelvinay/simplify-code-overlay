---
name: run-release-gate
description: Run the project's integration or UAT test suite against a reviewed feature branch and produce a clear pass/fail report before merge is approved. Use as the last check after PR review has approved the changes, before handing off to finishing-a-development-branch for the actual merge.
argument-hint: "<branch name or PR number>"
---

# Run Release Gate

The last check before code becomes mergeable. This skill's only job is an
honest pass/fail — it does not decide to merge, and it does not soften a
failure into "mostly fine."

## Preconditions

- PR review has approved the changes (this is not a substitute for review)
- The branch is up to date with the default branch

## Workflow

### 1. Find the real test command — don't assume one

Check, in order: a documented script (`package.json` scripts, `Makefile`
target, CI config file like `.github/workflows/*.yml` or
`azure-pipelines.yml`). Use whatever the project actually runs in CI, not
a guessed command — an integration suite run the wrong way can pass
locally while the real one would have failed.

### 2. Run it, capture everything

Don't summarize output you didn't actually see complete. If the suite is
long-running, wait for it — a truncated read that happens to look green
partway through is not a pass.

### 3. Report per-suite, not one verdict

```
## Release Gate — <branch/PR>
- Unit tests: PASS (142/142)
- Integration tests: PASS (38/38)
- UAT suite: FAIL (2/40) — see below
```

A single overall "looks good" hides exactly the information this gate
exists to surface. Never round a partial pass up to "all good."

### 4. On failure — diagnose before reporting, don't just relay

Check whether the failure is caused by this branch's changes or is
pre-existing/flaky:
- Does the same test fail on the current default branch too?
- Is there a recent history of this specific test being flaky (check CI
  history if `~~ci` is connected)?

State which it is. "This is pre-existing on main, not introduced by this
change" and "this is a real regression introduced here" require very
different next steps, and reporting a flaky/pre-existing failure as if
this branch caused it will send someone down the wrong path.

### 5. On pass — hand off explicitly, don't merge yourself

State plainly: "Release gate passed. Ready for `finishing-a-development-
branch` to decide how to integrate this." This skill verifies; it doesn't
merge, and it doesn't decide what happens to the target environment after
merge — that's the next skill's job, deliberately kept separate so a
passing test run is never silently treated as a merge decision.

## Tips

- If the "integration/UAT suite" doesn't actually exist for this repo yet,
  say that plainly rather than inventing a substitute check that looks
  like one.
- A gate that's flaky enough to need re-running "just to be sure" every
  time is a signal worth raising, not routing around silently.

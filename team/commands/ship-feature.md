---
description: Run the full development lifecycle for one ticket, start to finish — understand the requirement, plan, implement with tests, review, branch, PR, gate, and hand off for merge
---

# /ship-feature

> If you see unfamiliar `~~category` placeholders, see `CONNECTORS.md` in the
> `dev-lifecycle` skill directory.

Runs one ticket through the whole pipeline, checkpoint by checkpoint. Most
of these steps already exist as skills — this command's job is sequencing
them correctly and not skipping a checkpoint under time pressure.

## Usage

```
/ship-feature <ticket ID or URL>
```

## The pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. UNDERSTAND     intake-ticket                                      │
│                    -> restate the ask, pull acceptance criteria,      │
│                       surface open questions BEFORE anything else     │
├─────────────────────────────────────────────────────────────────────┤
│  2. DESIGN          write-spec  (thin ticket)                         │
│                     or writing-plans  (scope already clear)           │
│                     -> skip only for genuinely trivial fixes          │
├─────────────────────────────────────────────────────────────────────┤
│  3. IMPLEMENT       test-driven-development                           │
│                     -> tests first, then the code that passes them    │
├─────────────────────────────────────────────────────────────────────┤
│  4. SELF-CHECK      verification-before-completion                    │
│                     -> run the real verification commands; evidence   │
│                        before claiming "done"                         │
├─────────────────────────────────────────────────────────────────────┤
│  5. AGENT REVIEW    requesting-code-review -> receiving-code-review   │
│                     -> catch what you can before a human has to       │
├─────────────────────────────────────────────────────────────────────┤
│  6. BRANCH          branch-and-push                                   │
│                     -> fresh base, correct name, traceable commits    │
├─────────────────────────────────────────────────────────────────────┤
│  7. HUMAN REVIEW    open-pr-for-review                                │
│                     -> real PR, real reviewers, linked back to the    │
│                        ticket — then WAIT for actual approval          │
├─────────────────────────────────────────────────────────────────────┤
│  8. RELEASE GATE    run-release-gate                                  │
│                     -> integration/UAT suite, honest per-suite report │
├─────────────────────────────────────────────────────────────────────┤
│  9. INTEGRATE       finishing-a-development-branch                    │
│                     -> the actual merge decision, once 1-8 are clean  │
└─────────────────────────────────────────────────────────────────────┘
```

## Workflow

### 1. Start at intake, always

Never skip straight to coding because the ticket "looks simple." Run
`intake-ticket` first — it's also what decides whether step 2 is needed
at all.

### 2. Checkpoint after each step — don't silently chain

After each numbered step, state what happened and what's next, in one or
two lines. This is a pipeline a human is meant to interrupt, not a script
that runs to completion unattended:

- After intake: surface open questions before proceeding, if any exist.
- After design: confirm the plan/spec matches what the developer expected
  before implementing against it.
- After implementation + self-check: this is the natural pause point to
  hand off to the developer if they want to look before it goes further.
- After agent review: fix what's fixable now; don't push known issues
  downstream to human reviewers who'll just bounce them back.
- **After opening the PR: stop and wait.** Step 7's actual approval comes
  from a human, on their own timeline. Do not proceed to step 8 without it.
- After the release gate: report the result plainly, pass or fail, before
  touching step 9.

### 3. Treat a failure at any step as a full stop, not a detour

If `run-release-gate` fails, or agent review turns up a real problem, or
the developer disagrees with the plan — stop the pipeline there. Fix the
actual thing, re-run from the step that failed, don't route around it by
skipping ahead.

## Tips

- This command is a checklist with teeth, not a shortcut to skip thinking
  at any one step. If a step feels unnecessary for a specific ticket, say
  so explicitly and explain why, rather than silently omitting it.
- The two steps most often skipped under deadline pressure are agent
  review (step 5) and the release gate (step 8) — precisely because
  skipping them doesn't fail loudly in the moment. Don't skip them.
- If the repo doesn't have an integration/UAT suite yet, say that
  honestly at step 8 rather than reporting a pass with nothing behind it.

---
name: branch-and-push
description: Create a correctly-named feature branch tied to the source ticket and push tested, reviewed changes to it. Use after implementation and tests pass, before opening a PR — never before.
argument-hint: "<ticket ID> [feature|bugfix|chore]"
---

# Branch and Push

Get finished work onto a feature branch cleanly — right base, right name,
right history — so the PR that follows has nothing to clean up.

## Preconditions — check these before doing anything

Do not run this skill until all of the following are true. If any aren't,
stop and say which one isn't, rather than proceeding anyway:

- [ ] Tests pass locally (this skill does not run them — `test-driven-development`
      and `verification-before-completion` are what establish this)
- [ ] `git status` shows only the intended changes — no stray debug files,
      no unrelated edits picked up along the way
- [ ] You know the ticket ID this work traces back to (from `intake-ticket`)

## Workflow

### 1. Get the latest base branch first

```bash
git fetch origin
git status   # confirm nothing uncommitted would be discarded
```

Branch from the **freshly-fetched** default branch, not whatever was
checked out an hour ago — this is the same lesson as "clone fresh before
opening a PR": stale bases are the #1 cause of avoidable merge conflicts.

### 2. Name the branch correctly

Check for an existing convention first — `CONTRIBUTING.md`, a documented
pattern in the README, or how recent branches are actually named
(`git branch -r | head -20`). If none exists, default to:

```
<type>/<ticket-id>-<short-slug>
```
e.g. `feature/JIRA-4821-sso-login`, `bugfix/ADO-1290-null-check`

### 3. Commit with traceability

Every commit message should let someone find the ticket without asking:
include the ticket ID. Follow the repo's existing commit message style if
one is established (check `git log` first) rather than imposing a new one.

### 4. Push — with real guardrails

```bash
git push -u origin <branch-name>
```

- **Never** push directly to the default branch (`main`/`master`).
- **Never** force-push a branch other people might have based work on.
- If the push is rejected because the remote branch has moved, `git pull
  --rebase` and resolve, don't force-push over it.

## Tips

- If you're not sure whether to open a new branch or continue on an
  existing one, check whether the existing branch's PR (if any) is still
  open and unmerged — reuse it rather than fragmenting the work.
- A feature branch that's about to diverge significantly from main (long
  -running work) should periodically re-fetch and rebase/merge — don't let
  it drift for weeks and then discover a wall of conflicts at PR time.

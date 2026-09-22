---
name: open-pr-for-review
description: Open a real pull request for a pushed feature branch, with a description linking back to the source ticket and summarizing what changed and how it was tested, and request human reviewers. Use after branch-and-push. This is distinct from requesting-code-review, which asks an agent for feedback before this point — this step asks actual people.
argument-hint: "<ticket ID or branch name>"
---

# Open PR for Review

Get a real pull request in front of real reviewers, with enough context
that they don't have to reconstruct what happened from the diff alone.

## Preconditions

- The branch is already pushed (`branch-and-push` has run)
- The branch is up to date with the latest default branch — if not, fetch
  and rebase/merge *before* opening the PR, not after a reviewer flags it

## Workflow

### 1. Confirm the branch isn't stale

```bash
git fetch origin
git log origin/main..HEAD        # what this PR actually adds
git log HEAD..origin/main         # what this branch is missing
```

If the second command shows commits, update the branch before opening the
PR — a PR opened against a stale base creates review noise and conflict
risk that didn't need to exist.

### 2. Write the PR description from a template, not a blank box

```markdown
## Summary
[1-3 sentences: what changed and why]

## Ticket
[link or ID from intake-ticket]

## Changes
- [bullet per meaningful change, not a file-by-file list]

## Test plan
- [ ] Unit tests: [pass/fail, what's covered]
- [ ] Manual verification: [what you actually checked by hand, if anything]
- [ ] Screenshots/recording: [if UI-facing]
```

### 3. Open it

Use the real tool, not a manual push-and-hope:
- **GitHub**: `gh pr create --title "..." --body "..."`
- **Azure DevOps**: `az repos pr create --title "..." --description "..."`

Never describe a PR as opened without having actually run the command and
confirmed it returned a real URL.

### 4. Request reviewers

Check for a `CODEOWNERS` file or a documented review policy first. If one
exists, follow it. If not, ask who should review rather than guessing or
skipping this step — an unrequested reviewer often means an unreviewed PR.

### 5. Close the loop back to the ticket

If **~~project tracker** is connected, link the PR on the originating
ticket (comment or the tracker's native PR-link field) so anyone looking
at the ticket can find the code without searching.

## Tips

- A PR description that just says "see ticket" makes the reviewer do two
  context switches instead of zero. Restate the essentials even if they're
  also in the ticket.
- If CI is connected (`~~ci`) and hasn't reported back yet, say so rather
  than implying the PR is ready for review before checks have run.
- This skill's job ends at "PR is open, right people notified." Whether it
  gets approved, and whether to merge, belongs to the human reviewers and,
  once approved, to `run-release-gate` and `finishing-a-development-branch`.

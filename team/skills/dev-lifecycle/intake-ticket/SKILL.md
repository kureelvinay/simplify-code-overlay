---
name: intake-ticket
description: Turn a Jira or Azure DevOps work item into an implementation-ready understanding before any code is written — scope, acceptance criteria, open questions. Use at the very start of any development task that traces back to a ticket, before planning or coding.
argument-hint: "<ticket ID or URL>"
---

# Intake Ticket

> If you see unfamiliar `~~category` placeholders, see `CONNECTORS.md` in this
> skill's parent directory.

Turn a raw ticket into a brief a developer can actually start from — not a
restated copy of the ticket, but a check that the ticket is understood
*correctly* before time is spent building the wrong thing.

## Usage

Invoke by ticket ID or URL — e.g. "intake JIRA-4821" or "start work on
https://dev.azure.com/.../workitems/edit/1290".

## Workflow

### 1. Resolve the ticket

Fetch it from **~~project tracker** by ID or URL. If no tracker is
connected, accept a pasted ticket body directly — do not block on the
connector.

### 2. Extract, don't invent

Pull out:
- **Title and restated ask** — one paragraph, in your own words, of what's
  actually being requested. This is the single most useful line in the
  brief: if your restatement is wrong, that's caught now, not after coding.
- **Acceptance criteria** — as written. If the ticket has none, say so
  explicitly rather than writing your own guessed criteria.
- **Linked work** — parent epic, blocking/blocked-by tickets, related PRs.
- **Attachments** — mockups, logs, error messages already provided.

### 3. Classify before scoping effort

- **Trivial fix** (typo, one-line bug, config change) → skip straight to
  implementation with `test-driven-development`; a full spec is overkill.
- **Real feature or non-trivial bug** → recommend `write-spec` (if the
  ticket is thin) or `writing-plans` (if the ticket already has clear
  scope and just needs an implementation plan) before touching code.
- **Ambiguous which one this is** → default to treating it as non-trivial.
  Under-scoping is the expensive mistake here, not over-scoping.

### 4. Surface open questions — don't paper over them

List anything genuinely unclear as an explicit open question, tagged who
should answer it (usually the product owner who filed the ticket). Do not
resolve ambiguity by guessing and moving on. A wrong guess costs more than
asking.

### 5. Produce the Ticket Brief

```
## Ticket Brief — <ID>
**Ask (restated):** ...
**Acceptance criteria:** [as-written checklist, or "none provided — see open questions"]
**Type:** trivial fix | feature | non-trivial bug
**Open questions:** [tagged with who answers]
**Next skill:** write-spec | writing-plans | test-driven-development
```

Hand this off as the starting artifact for whatever comes next — don't
re-derive scope later in the pipeline.

## Tips

- A ticket with vague acceptance criteria is a signal to ask the product
  owner before coding, not a gap to fill in yourself.
- The restated-ask paragraph is a comprehension check, not a formality —
  write it as if someone else has to verify you understood correctly.
- Don't classify a ticket as "trivial" just because it sounds small in the
  title. Read the acceptance criteria first.

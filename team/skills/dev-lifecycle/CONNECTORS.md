# Connectors

## How tool references work

Skills in this pack use `~~category` as a placeholder for whatever tool is
connected in that category — same convention as `product-management`'s
CONNECTORS.md. Skills describe workflows in terms of categories, not
specific products, so the same skill works whether the team is on Jira or
Azure DevOps, GitHub or Azure Repos.

## Connectors for this pack

| Category | Placeholder | Included servers | Other options |
|----------|-------------|-----------------|---------------|
| Project tracker | `~~project tracker` | Atlassian (Jira) | Azure DevOps (ADO) Boards, Linear, Asana |
| Source control | `~~source control` | GitHub | Azure DevOps (ADO) Repos, GitLab, Bitbucket |
| CI / test runner | `~~ci` | GitHub Actions | Azure Pipelines, Jenkins, CircleCI |

If a category isn't connected, the skill falls back to what the developer
provides directly (a pasted ticket, a manual `git` command, reading the
repo's own test scripts) — never ask the developer to connect a tool mid-task.

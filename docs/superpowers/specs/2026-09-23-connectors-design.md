# Connectors for Simplify Code: design

Status: approved in conversation 2026-09-23, awaiting written-spec review.
Scope: brainstormed as an **architectural** change (a new shipped capability, a build transform, a UI change).

## 1. Goal

Developers connect Simplify Code to the company's work systems (Jira and Confluence, Azure DevOps, Slack,
Salesforce, ServiceNow, Outlook), pull data from them into a session and work on it, from a familiar
place in the app, the way Claude does: a "+" menu under the chat box with a list of connectors.

Success looks like: a developer installs the desktop app (or the terminal build), opens the "+" menu, sees
the company's connectors, signs in to the ones they use with their own account, and the shipped skills
(`~~project tracker`, `~~chat`, `~~email`, `~~calendar`, `~~knowledge base`, `~~source control`, `~~ci`)
start using them with no rewriting.

### Non-goals
- A marketplace or catalog of connectors beyond the company list. Developers do not add their own.
- A company connector hub or proxy behind the gateway (approach C below); the design leaves the door open.
- Building any connector server. Every system is reached through an existing MCP server.
- Testing against real tenants. That is a manual checklist owned by the team with the tenants (section 9).

## 2. Decisions taken

| Decision | Choice | Reason |
|---|---|---|
| Whose identity | **Each developer signs in as themselves** (OAuth) | Sees only what they may see; audit names the person; revoking access at the source cuts them off; no shared secret ships in the installer |
| Approach | **A: hosted MCP servers, configured centrally** in the enforced config | Nothing to install, updates ship with the app. B (local `npx`/`uvx` servers everywhere) needs Node/Python on every VM and drifts; C (gateway hub) is new infrastructure, kept for later |
| Control | A **connector lock**, same idea as the plugin lock | Developers cannot add or alter connectors |
| Write safety | Connector tools **ask** before running unless explicitly allowed as read-only | Untrusted text (tickets, mail, chat) reaches a model that also has shell and file tools |
| UI | The "+" button becomes a menu: **Add files** and **Connectors** | Matches the Claude experience the users expect |

## 3. What already exists (verified in v1.18.31)

- Connectors are MCP servers. Config key `mcp`, each entry `type: "remote"` (`url`, `headers`, `oauth`,
  `timeout`, `enabled`) or `type: "local"` (`command`, `environment`, `timeout`, `enabled`).
- OAuth for remote servers is built in: `mcp auth`, default redirect
  `http://127.0.0.1:19876/mcp/oauth/callback`. Tokens are stored per user in
  `<data folder>/mcp-auth.json` with mode 0600, never in the company set.
- The GUI already has a connector list: `/mcp` ("MCPs" dialog, search, on/off switch, status) and the
  session-header status popover ("MCP" tab, colour dot per status). Selecting a connector in state
  `needs_auth` calls the authenticate function, so sign-in works from the GUI today.
- Today's "+" under the chat box is "Add files" only: one button that opens the file picker.
- Permission rules already decide which MCP tools are visible to the model (`Permission.visibleTools`).
  MCP tool annotations (`readOnlyHint`) are **not** used anywhere, so read versus write cannot be inferred.
- Missing UI strings fall back to English in every locale, so a new English-only key is safe.

## 4. Design

### 4.1 The connector list in the enforced config

`managed/simplify-code.jsonc` gains an `mcp` block. It ships inside both products (desktop resources and
the terminal binary) through the existing company-set mechanism, so no new delivery path.

Keys are short and stable because they prefix tool names: `atlassian`, `azure-devops`, `slack`,
`salesforce`, `servicenow`, `outlook`.

| Key | Server | Transport and auth | Needs from IT first |
|---|---|---|---|
| `atlassian` | Atlassian's official hosted server, `https://mcp.atlassian.com/v2/mcp` (Jira, Confluence, JSM, Bitbucket) | remote, OAuth 2.1 with dynamic client registration | nothing per app |
| `azure-devops` | Microsoft's official hosted server (remote, GA) | remote, Microsoft Entra | Org backed by Entra; Entra must accept dynamic client registration or client-ID metadata documents, otherwise fall back to Microsoft's local server (`azure-devops-mcp` via `npx`) |
| `slack` | Slack's official hosted server, `https://mcp.slack.com/mcp` | remote, OAuth | Workspace admin approves the app |
| `salesforce` | Salesforce hosted MCP servers (GA) | remote, per-user OAuth with PKCE | Admin creates an External Client App per org; its client id goes in `oauth.clientId` |
| `servicenow` | ServiceNow MCP Server Console | remote, per-user OAuth 2.0 authorization code | Admin configures an inbound integration; instance-specific URL |
| `outlook` | **Undecided.** No first-party hosted server found. Community server `ms-365-mcp-server` (local, Microsoft Graph) is the candidate | local (`npx`, pinned version) | Entra app registration and consent; security review of third-party code that handles mail |

Rules the checker (`script/check-managed.ts`, `src/managed.ts`) will enforce for `mcp`:
- remote URLs are `https` and not placeholders or loopback;
- no literal token or secret in `headers`, `environment` or `oauth`; only `{env:}` or `{file:}` references;
- local `command` packages are pinned to an exact version (an unpinned `npx pkg` changes overnight);
- an OAuth `clientId` that is still a placeholder fails the check for that connector.

Connectors not yet ready (missing admin registration) ship `"enabled": false` so they never show a broken
sign-in; enabling one is a one-line config change and a rebuild.

### 4.2 Sign-in

Per developer, on demand, using the existing flow: choosing a connector in `needs_auth` opens the browser
for that system's OAuth; the token lands in the developer's own `mcp-auth.json`. Nothing about a session
requires any connector; the skills already fall back to pasted context when a category is not connected.

### 4.3 Connector lock (build transform)

A marker file `mcp-lock` in the company folder (shipped from `managed/mcp-lock`, parallel to
`managed/plugin-lock`). While it exists, after every config source has merged, the loader:
1. keeps only `mcp` entries declared by an administrator source (managed folder, bundled company set,
   team folder, MDM profile), reusing `isAdminSource`;
2. **replaces** an administrator-declared entry with the administrator's definition outright, so a developer
   cannot alter its URL, headers or command by deep-merging extra fields onto it;
3. logs `connector lock: ignoring connectors not declared by an administrator` naming the dropped keys.

`mcp` is a record merged by key, so origins are not tracked as for plugins; the transform collects the
administrator-declared keys while the administrator directories are merged.

### 4.4 Permissions

Default: every connector tool is `ask`. Per connector, a **read-tool allow-list** in the enforced
`permission` block turns known read tools (search, get, list) into `allow`. Because the app does not
classify tools, the lists are produced by inspecting each server's tool list (the first implementation step, a spike) and are
maintained in the repo next to the connector definitions. Write tools (create, update, delete, send, post)
are never on an allow-list.

### 4.5 The "+" menu (GUI transform)

The "+" button in `packages/app/src/components/prompt-input.tsx` currently calls the file picker directly.
It becomes a popover:

```
   Add files
   ------------------------
   Connectors
   ● Atlassian          on
   ● Slack              on
   ○ Azure DevOps       Sign in
   ○ Salesforce         Sign in
```

- **Add files** keeps the current behaviour and shortcut.
- **Connectors** lists `sync().data.mcp` with the status dot used by the status popover; the switch or the
  "Sign in" action calls the existing `useMcpToggle` (which authenticates when the state is `needs_auth`).
- Display names are the config keys prettified by a small map (`azure-devops` shows "Azure DevOps").
- No "add custom connector" entry, matching the lock. The full `/mcp` dialog and status popover remain.
- New strings (`prompt.action.connectors` and similar) are added to the English dictionary only.
- Applies to the desktop app and `simplify-code web`. The terminal keeps `mcp list`, `mcp auth`, `/mcp`.
- Follows the existing rules: the transform edits an exact anchor with an exact count and fails the build
  on drift; a token-alias test guards any CSS.

### 4.6 Data path and security

- Data pulled from a connector reaches a model only through the company gateway (`enabled_providers` lock).
- **Prompt injection is the main risk**: tickets, mail and chat are untrusted text read by a model that also
  holds shell and file tools. Mitigations are the ask-by-default permissions, the lock, and least-privilege
  scopes chosen when IT registers each OAuth app. No mitigation removes the risk; the docs say so.
- Tokens stay per user (0600). Client secrets, where a system needs one, are `{file:}` references
  supplied per machine, never shipped.

## 5. Delivery and phases

1. **Phase 0, infrastructure** (no external system needed): the `mcp` config block with `enabled:false`
   placeholders, the linter rules, the connector lock, the permission scaffolding, the "+" menu, and an
   end-to-end fake connector.
2. **Phase 1:** `atlassian`, `slack`, `azure-devops` enabled (least admin setup).
3. **Phase 2:** `salesforce`, `servicenow` (each needs the admin registration first).
4. **Phase 3:** `outlook`, after the decision between the community local server and waiting for an official one.

## 6. Prerequisites owned by SimplifyX IT (not something the build can do)

Slack workspace approval; Salesforce External Client App per org; ServiceNow inbound integration and MCP
server publication; Microsoft Entra app registration and consent for Outlook (and possibly Azure DevOps);
a security review of any third-party MCP server code. These set the real schedule for phases 2 and 3.

## 7. Testing

- **Unit:** the new transforms against the pristine fixtures (anchors, counts, executed helper for the lock
  filter); linter rules for each `mcp` rule above; the lock's replace-not-merge behaviour.
- **End to end, real binary:** a small fake MCP server (remote type, HTTP) exercising: connector appears,
  ask-before-run, allow-listed read tool runs without asking, lock drops a developer-added connector and
  ignores a developer override of an administrator one, an unreachable connector does not stop the app.
- **GUI:** build, run `simplify-code web` against the fake server, and inspect the "+" menu in the browser
  pane in light and dark mode: menu contents, status dots, sign-in state, keyboard focus.
- **Manual, on the VM, per system:** a checklist (sign in, run one read query, confirm a write asks,
  revoke access and confirm it stops). Real sign-in cannot be automated without tenant credentials.

## 8. Risks and open items

- **Azure DevOps and Entra:** dynamic client registration support may be missing; the fallback is the local
  server, which reintroduces a Node requirement on the VM for that one connector.
- **Outlook** has no first-party hosted server in current research; phase 3 needs a decision.
- **Exact endpoints** for Azure DevOps, Salesforce (per org) and ServiceNow (per instance) are to be
  confirmed against each vendor's documentation and the customer's tenant during implementation.
- **Upstream drift:** the "+" menu edits a frequently changing file; the build fails loudly on drift.
- **Version drift of vendors' servers** (for example Atlassian's endpoint version) is a maintenance item.

## 9. Out of scope, for a later design

A connector hub behind the gateway (approach C); an admin-only "add connector" path; connector usage
reporting; per-connector display metadata beyond the name map.

## 10. Sources

Research done 2026-09-23 (vendor documentation): Atlassian Rovo MCP server, Azure DevOps remote MCP server,
Slack MCP server, Salesforce hosted MCP servers, ServiceNow MCP Server Console, and the community
`ms-365-mcp-server` for Outlook.

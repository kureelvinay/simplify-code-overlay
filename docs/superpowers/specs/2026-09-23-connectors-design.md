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
- The "+" under the chat box: in the legacy composer it is a single "Add files" button, but the **new layout
  (the default, and what the session page renders) already has a "+" menu**: Attachments, Commands, Context,
  Shell. It lives in `session-ui` (`PromptInputV2AddMenu`), a generic component with no access to app state; the
  app builds the controller and props it receives. (Corrected after implementation began: an earlier reading of
  the legacy composer said the "+" had no menu.)
- The app's own default permission is `"*": "allow"`, so connector tools run **without asking** unless the
  enforced config says otherwise.
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
| `azure-devops` | Microsoft's **local** server, `@azure-devops/mcp` via `npx` (not the hosted one) | local, the package's own default `interactive` auth (developer's own Microsoft account) | None from IT: no Entra app registration needed, because the local server's default auth is not the hosted server's OAuth flow. Needs Node.js 20+ on the developer's machine. **Verified 2026-09-28 with a real, authenticated `tools/call` against a real org** (`SimplifyHealthcare`), not just a reachability check. Shipped. The hosted server remains available later for a one-click, no-Node experience, once an Entra app is registered |
| `slack` | Slack's official hosted server, `https://mcp.slack.com/mcp` | remote, OAuth. **Verified against the real endpoint: its login server does not support automatic client registration** | A Slack app registered by IT and its client id in `oauth.clientId`; workspace admin approves it. Ships pending |
| `salesforce` | Salesforce hosted MCP servers (GA) | remote, per-user OAuth with PKCE | Admin creates an External Client App per org; its client id goes in `oauth.clientId` |
| `servicenow` | ServiceNow MCP Server Console | remote, per-user OAuth 2.0 authorization code | Admin configures an inbound integration; instance-specific URL |
| `outlook` | **Undecided.** No first-party hosted server found. Community server `ms-365-mcp-server` (local, Microsoft Graph) is the candidate | local (`npx`, pinned version) | Entra app registration and consent; security review of third-party code that handles mail |

Rules the checker (`script/check-managed.ts`, `src/managed.ts`) will enforce for `mcp`:
- remote URLs are `https` and not placeholders or loopback;
- no literal token or secret in `headers`, `environment` or `oauth`; only `{env:}` or `{file:}` references;
- local `command` packages are pinned to an exact version (an unpinned `npx pkg` changes overnight);
- an OAuth `clientId` that is still a placeholder fails the check for that connector.

Connectors not yet ready (missing admin registration) are **not** in the shipped config. A disabled entry
still appears in the menu with a switch, and switching it on would fail against a placeholder address. Their
templates live in `managed/connectors.pending.jsonc` (with the permission rule each will need); shipping one
means filling in the placeholders and moving its two blocks into `managed/simplify-code.jsonc`. The checker
rejects a placeholder in an enabled connector, so a template cannot ship by accident. Shipped now: `atlassian`
and `azure-devops` (local). Pending: `slack`, `salesforce`, `servicenow`, `outlook`.

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

Default: every connector tool is `ask`, written explicitly per connector (`"<key>_*": "ask"`) because the app
allows by default. The checker requires the rule for every enabled connector and requires any read-only allow
rule to come **after** it (the last matching rule wins).

**Administrator rules are re-applied last.** Found by an end-to-end scenario: when the same key exists in a
developer's file and an administrator's, the merged object keeps the *developer's earlier position*, so a
developer who first writes `"atlassian_*"` and then a narrower `"atlassian_create*": "allow"` would put their
allow after the company's ask and win. After every source has merged, the loader now deletes and re-inserts every
administrator-declared permission rule, so the company's rules are always the last ones.

Per connector, a **read-tool allow-list** in the enforced
`permission` block turns known read tools (search, get, list) into `allow`. Because the app does not
classify tools, the lists are produced by inspecting each server's tool list (the first implementation step, a spike) and are
maintained in the repo next to the connector definitions. Write tools (create, update, delete, send, post)
are never on an allow-list.

### 4.5 The "+" menu (GUI transform)

The new-layout "+" menu (`PromptInputV2AddMenu` in `session-ui`) gains a **Connectors** group under Shell. The
menu takes an optional `connectors` prop (absent means upstream's menu, unchanged); the app composer supplies it
from the live connector state and the same toggle the `/mcp` dialog uses:

```
   Add files
   ------------------------
   Connectors
   ● Atlassian          on
   ● Slack              on
   ○ Azure DevOps       Sign in
   ○ Salesforce         Sign in
```

- **Add files, Commands, Context, Shell** keep their current behaviour and shortcuts.
- **Connectors** lists `sync().data.mcp` with the status dot used by the status popover; the switch or the
  "Sign in" action calls the existing `useMcpToggle` (which authenticates when the state is `needs_auth`).
- Display names are the config keys prettified by a small map (`azure-devops` shows "Azure DevOps").
- No "add custom connector" entry, matching the lock. The full `/mcp` dialog and status popover remain.
- One new string (`prompt.action.connectors`) in the English dictionary only; status badges reuse the existing
  `mcp.status.*` strings.
- Applies to the desktop app and `simplify-code web`. The terminal keeps `mcp list`, `mcp auth`, `/mcp`.
- Connected and switched-off connectors are checkbox rows; sign-in, failed and pending ones are plain rows with a
  badge. Follows the existing rules: every edit is an exact anchor with an exact count and fails the build on drift.

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
2. **Phase 1:** `atlassian` enabled (done). `slack` was planned here as needing the least admin setup, but
   checking the real endpoint showed it needs a registered app and client id, so it waits with the others for
   IT. `azure-devops` was added later, once its local-server, no-registration path was found and verified
   against a real org and account.
3. **Phase 2:** `salesforce`, `servicenow` (each needs the admin registration first).
4. **Phase 3:** `outlook`, after the decision between the community local server and waiting for an official one.

## 6. Prerequisites owned by SimplifyX IT (not something the build can do)

Slack workspace approval; Salesforce External Client App per org; ServiceNow inbound integration and MCP
server publication; Microsoft Entra app registration and consent for Outlook; a security review of any
third-party MCP server code (Outlook's candidate, and Azure DevOps's own local server, since it runs
arbitrary vendor code on the developer's machine even though it needed no registration). Node.js 20+ must be
present on every developer's machine for Azure DevOps to work. These set the real schedule for phases 2 and 3.

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

- **Automatic client registration is not universal.** Found only by connecting to the real servers: Atlassian
  supports it, Slack does not, and Entra (Azure DevOps) does not either. The design's "no per-app registration"
  claim held only for Atlassian. Probing each vendor's real endpoint before enabling it is now part of enabling a
  connector.
- **Azure DevOps and Entra:** dynamic client registration support may be missing; the fallback is the local
  server, which reintroduces a Node requirement on the VM for that one connector.
- **Outlook** has no first-party hosted server in current research; phase 3 needs a decision.
- **Exact endpoints** for Azure DevOps, Salesforce (per org) and ServiceNow (per instance) are to be
  confirmed against each vendor's documentation and the customer's tenant during implementation.
- **Upstream drift:** the "+" menu edits three files in two packages; the build fails loudly on drift.
- **Version drift of vendors' servers** (for example Atlassian's endpoint version) is a maintenance item.

## 9. Out of scope, for a later design

A connector hub behind the gateway (approach C); an admin-only "add connector" path; connector usage
reporting; per-connector display metadata beyond the name map.

## 10. Sources

Research done 2026-09-23 (vendor documentation): Atlassian Rovo MCP server, Azure DevOps remote MCP server,
Slack MCP server, Salesforce hosted MCP servers, ServiceNow MCP Server Console, and the community
`ms-365-mcp-server` for Outlook.

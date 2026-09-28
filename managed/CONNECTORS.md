# Connectors

Connectors let developers pull data from the company's work systems into a session. They are MCP servers, listed
in the **+** menu under the chat box (and in `/mcp` and the status popover). Design and reasons:
`docs/superpowers/specs/2026-09-23-connectors-design.md`.

## What developers see

Click **+** under the chat box, then look under **Connectors**:

- a ticked row is connected; click it to switch it off;
- an unticked row is switched off; click it to connect;
- a row with a **needs auth** badge signs in: click it and the browser opens for that system's own login. The
  developer signs in as themselves, so the app sees only what they may see;
- a **failed** badge means the server could not be reached (network, or the address is wrong).

Two kinds of connector under the hood, both shown the same way in the menu:

- **Hosted (`type: "remote"`)** — the app talks to the vendor's own server over the network; Atlassian is this kind.
- **Local (`type: "local"`)** — the app runs the vendor's program itself (via `npx`) and talks to it on this machine;
  Azure DevOps is this kind, and it needs **Node.js 20 or later installed separately** on the machine (Simplify Code's
  own binary does not provide a system-wide `npx`). Without Node, that row shows **failed**.

Nothing requires a connector. Skills that use one (`~~project tracker`, `~~chat`, ...) fall back to pasted context
when it is not connected. Tokens are stored per developer in their own data folder (`mcp-auth.json`, mode 0600),
never in the company set.

## What ships now

| Connector | Server | Notes |
|---|---|---|
| `atlassian` | Atlassian's hosted server (Jira, Confluence, Jira Service Management, Bitbucket) | Clients register themselves; nothing to do on your side. Checked against the real endpoint: it answers "needs authentication", shown as a Sign in row |
| `azure-devops` | Microsoft's **local** server (`npx @azure-devops/mcp`), organisation `SimplifyHealthcare` | No Entra app registration: its default `interactive` auth signs the developer in with their own Microsoft account. Verified with a real, authenticated call against `SimplifyHealthcare` (returned a real project). Needs Node.js 20+ on the machine (see above); a token already cached on the machine (from `az login`, VS Code, etc.) is reused silently instead of opening a browser |

Slack is **not** shipped yet. Its login server does not support automatic client registration (the app reports
"Incompatible auth server: does not support dynamic client registration" when it tries), so a shipped Slack row
would show "failed" for everyone. It waits in `connectors.pending.jsonc` for a Slack app that IT registers.

Azure DevOps could instead use Microsoft's **hosted** server, matching the other connectors' one-click browser
sign-in exactly and needing no Node.js — but that path needs an Entra app registration first (Entra has no
automatic client registration, the same problem Slack has). The template for it is documented as a comment in
`connectors.pending.jsonc` if you want to switch to it later.

Every enabled connector has an `"<key>_*": "ask"` rule in the enforced config: **the app allows every tool by
default**, so without that line a connector could create tickets or post messages without asking. The checker
(`bun run script/check-managed.ts`) refuses an enabled connector without it, and refuses a read-only allow rule
written before it (the last matching rule wins).

Two locks keep the list the company's:

- `mcp-lock` (shipped from `managed/mcp-lock`): only administrator-declared connectors load, exactly as declared.
  A developer can neither add a connector nor add a url or header to a company one.
- Administrator permission rules are always applied last, so a developer cannot loosen an ask rule, not even by
  writing the same key first and a narrower allow after it.

## Enabling a pending connector

Templates for the connectors that need something from your IT are in `managed/connectors.pending.jsonc`. They are
not in the shipped config, because even a disabled entry would appear in the menu and fail when switched on.

1. Do the registration in the table below.
2. Copy the connector's block, and its line under `permission`, into `managed/simplify-code.jsonc`.
3. Replace every `REPLACE-...` value and set `"enabled": true`.
4. `bun run script/check-managed.ts` must print `ok, deployable` apart from the gateway address. It rejects a
   placeholder in an enabled connector.
5. Rebuild and republish (`--desktop-package`, `--package`).

| Connector | What your admin must do first |
|---|---|
| `slack` | Register a Slack app, allow the redirect URL `http://127.0.0.1:19876/mcp/oauth/callback`, put its client id in the connector, and have a workspace admin approve it. If Slack requires a client **secret**, do not put it in the config or the installer: anyone with the installer can read it. |
| `salesforce` | Create an External Client App in the org and a hosted MCP server configuration linked to it. The server URL and the client id go in the connector. Per-user OAuth with PKCE. |
| `servicenow` | Publish an MCP server in the MCP Server Console and create an OAuth inbound integration (authorization code grant is the only supported flow). The URL is specific to the instance. |
| `outlook` | No first-party hosted server was found. The candidate is the community `ms-365-mcp-server` (runs locally through Microsoft Graph): needs Node on the machine, an Entra app registration and consent, a security review of third-party code that handles mail, and an exact version you have reviewed. |

## Letting read-only tools run without asking

Only after inspecting the connector's tool list on a real tenant. In `managed/simplify-code.jsonc`, **after** the
connector's ask line, add narrower allow rules for tools that only read, for example
`"atlassian_search*": "allow"`. Tool names are `<connector>_<tool>`. Never allow a tool that creates, updates,
deletes, sends or posts. The app does not classify tools as read or write, so this list is yours to maintain.

## The risk to keep in mind

Tickets, mail and chat messages are untrusted text that a model reads while it also has file and shell tools. A
message can contain instructions aimed at the model. Ask-before-running is the main defence; least-privilege
scopes when you register each OAuth app are the other. Nothing removes the risk.

## Manual test checklist, per system, on a machine that can sign in

Real sign-in needs a real tenant, so this part is run by hand.

1. Open **+**: a hosted connector (Atlassian) is listed with **needs auth**. A local connector (Azure DevOps)
   may show **connected** immediately if the machine already has a cached Microsoft sign-in (from `az login`,
   Visual Studio, VS Code, etc.) — that is expected, not a bug.
2. If it says **needs auth**, click it: the browser opens the system's login. Sign in as a test developer. The
   row is now ticked. (For Azure DevOps specifically, the browser only opens on the **first tool call** the
   model actually makes, not on connecting — Node.js 20+ must be installed on the machine first, or the row
   shows **failed** instead.)
3. Ask for something the connector reads (for example "find my open tickets" or "list my Azure DevOps projects").
   It should answer from the real system.
4. Ask for something that writes (for example "create a test ticket" or "create a work item"). The app must
   **ask for permission first**. Deny it, and check nothing was created.
5. Try a system the test developer has no access to. The connector must not return it.
6. Revoke the test developer's access in the source system, then use the connector again. It must stop working.
7. On a machine with the lock: add a connector of your own to `~/.config/simplify-code/simplify-code.json`.
   It must not appear in the **+** menu.

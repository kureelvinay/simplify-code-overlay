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

Nothing requires a connector. Skills that use one (`~~project tracker`, `~~chat`, ...) fall back to pasted context
when it is not connected. Tokens are stored per developer in their own data folder (`mcp-auth.json`, mode 0600),
never in the company set.

## What ships now

| Connector | Server | Notes |
|---|---|---|
| `atlassian` | Atlassian's hosted server (Jira, Confluence, Jira Service Management, Bitbucket) | Clients register themselves; nothing to do on your side |
| `slack` | Slack's hosted server | A workspace admin must approve the app when the first developer signs in |

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
| `azure-devops` | Have an Azure DevOps organisation backed by Microsoft Entra, and Entra that accepts dynamic client registration (or client-ID metadata documents). If it does not, use Microsoft's local server, which needs Node on the machine. Confirm the endpoint on Microsoft Learn. |
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

1. Open **+**: the connector is listed with **needs auth**.
2. Click it: the browser opens the system's login. Sign in as a test developer. The row is now ticked.
3. Ask for something the connector reads (for example "find my open tickets"). It should answer from the system.
4. Ask for something that writes (for example "create a test ticket"). The app must **ask for permission first**.
   Deny it, and check nothing was created.
5. Try a system the test developer has no access to. The connector must not return it.
6. Revoke the test developer's access in the source system, then use the connector again. It must stop working.
7. On a machine with the lock: add a connector of your own to `~/.config/simplify-code/simplify-code.json`.
   It must not appear in the **+** menu.

# Company-managed configuration

`simplify-code.jsonc` in this folder is the configuration IT installs on every developer machine. It applies to the Simplify Code desktop app, the `simplify-code` terminal UI and `simplify-code web` alike, because all three read the same configuration.

A managed file loads **above** a developer's own `~/.config/opencode/opencode.json` and above any project's `opencode.json`. Developers cannot override it. That is the point, and also the risk: a mistake here breaks everyone at once and cannot be fixed locally. Always run the checker before deploying.

## What it enforces

| Setting | Effect |
|---|---|
| `provider.company-gateway` | The company AI gateway, with its four models and a `whitelist` so nothing else the gateway serves appears in the picker |
| `model`, `small_model` | Defaults, so a fresh install works without anyone choosing a model |
| `share: "disabled"` | `/share` would upload conversations to opencode.ai; off |
| `autoupdate: false` | New versions come from the rebrand pipeline, never from self-update |
| `enabled_providers` | **The provider lock that works today.** Only the gateway is usable, even if a developer adds another provider or already has another service's API key |
| `mcp`, connector `permission` rules | The company's connectors (Jira/Confluence now; Slack, Azure DevOps, Salesforce, ServiceNow, Outlook pending), each **asking** before a tool runs because the app allows by default. See `CONNECTORS.md` |
| `experimental.policies` | The same lock in upstream's newer form, kept so it survives the release where upstream switches over |

### Why the provider lock has two parts

Upstream's documentation says to use `experimental.policies` instead of the older `enabled_providers`. Tested against the real 1.18.31 binary, that is not yet true: with policies alone, `opencode models` still offered the built-in `opencode` provider (OpenCode Zen), which sends prompts outside the company. Policies are read by upstream's new core, which the released CLI and desktop app do not use for their provider list yet. `enabled_providers` is what locks them today. The checker requires both.

## Before deploying

1. **Set the gateway address.** Replace `https://REPLACE-WITH-YOUR-GATEWAY/v1`. It must be `https` and reachable from every developer machine. The config this was drafted from used `http://127.0.0.1:4000/v1`, a proxy on one laptop.
2. **Decide how each developer gets a gateway key.** The file expects one key per developer at `~/.config/simplifyx/gateway-key`, readable only by them (`chmod 600`). Never put a key in the managed file: every user on every machine can read it. If the gateway authenticates some other way (SSO, mutual TLS, network location), remove the `apiKey` line.
3. **Run the checker.** It must print `ok, deployable`:

   ```bash
   bun run script/check-managed.ts
   ```

   It rejects a placeholder, plain-http or loopback gateway address, a literal secret anywhere in the file, sharing or self-update left on, default models that do not exist, a whitelist that does not match the models, and an incomplete provider lock.

## Shipping it

`bun run src/pipeline.ts --team-package` bundles this file with the `team/` folder and root-only installers (`install-team.sh`, `install-team.ps1`). That is the supported way to install it; the paths below are what the installers use.

## Where to install it

| Platform | Path |
|---|---|
| macOS | `/Library/Application Support/simplify-code/simplify-code.jsonc` |
| Windows | `%ProgramData%\simplify-code\simplify-code.jsonc` |
| Linux | `/etc/simplify-code/simplify-code.jsonc` |

`install-team.sh` / `install-team.ps1` put it there, owned by root or Administrators and not writable by ordinary users. (Upstream's own managed location, `…/opencode/opencode.jsonc`, is still honoured if present, but nothing here creates it.)

On macOS with an MDM (Jamf, Intune, Kandji, FleetDM) there is a stronger option: a configuration profile for the preference domain `com.simplifyx.simplify-code.managed` (or upstream's `ai.opencode.managed`), whose keys are the same keys as this file. It outranks even the file above. Upstream's config documentation has the `.mobileconfig` template. A profile cannot carry comments, so strip them first.

## Try it without admin rights

Upstream has a test hook that points the managed location at any folder, which makes a dry run possible on one machine before touching `/Library`:

```bash
mkdir -p /tmp/managed-test && cp managed/simplify-code.jsonc /tmp/managed-test/
OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR=/tmp/managed-test simplify-code models
```

Only `company-gateway/...` models should be listed.

## Verify on a deployed machine

```bash
simplify-code models
```

```bash
simplify-code debug config
```

The first must list only gateway models. The second prints the resolved configuration: `share` must be `disabled`, `autoupdate` `false`, and `enabled_providers` exactly `["company-gateway"]`, whatever the developer's own config says. `debug config` also prints provider options, so do not paste its output anywhere if a machine still has a literal key in a personal config.

## What this file does not do

- **It does not decide who may use the "Frontier" model.** Its label says senior track only, but a client-side file cannot enforce that per person. Enforce it at the gateway, per key.
- **It does not install plugins.** The config this was drafted from loaded two (`superpowers` and an OpenTelemetry plugin). Those are personal or team choices. Add a `plugin` list here only if the company wants one on every machine, and remember it would then be impossible to remove locally.
- **It does not restrict what the agent may do** (file edits, shell commands). That is the `permission` block, documented upstream, and is a policy decision worth making deliberately rather than by default.
- **It does not brand or build anything.** It is independent of the rebrand pipeline and can be deployed with stock OpenCode too.

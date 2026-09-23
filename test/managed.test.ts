import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { lintManagedConfig, parseJsonc } from "../src/managed"

const good = {
  $schema: "https://opencode.ai/config.json",
  provider: {
    "company-gateway": {
      npm: "@ai-sdk/openai-compatible",
      name: "Company Gateway",
      options: { baseURL: "https://llm.simplifyx.example/v1", apiKey: "{file:~/.config/simplifyx/gateway-key}" },
      models: { bulk: { name: "Bulk" }, "bulk-light": { name: "Bulk Light" } },
      whitelist: ["bulk", "bulk-light"],
    },
  },
  model: "company-gateway/bulk",
  small_model: "company-gateway/bulk-light",
  enabled_providers: ["company-gateway"],
  mcp: {
    atlassian: { type: "remote", url: "https://mcp.atlassian.com/v2/mcp", enabled: true },
  },
  permission: { "atlassian_*": "ask" },
  share: "disabled",
  autoupdate: false,
  experimental: {
    policies: [
      { effect: "deny", action: "provider.use", resource: "*" },
      { effect: "allow", action: "provider.use", resource: "company-gateway" },
    ],
  },
}
const lint = (change: (c: any) => void) => {
  const c = structuredClone(good)
  change(c)
  return lintManagedConfig(JSON.stringify(c))
}

describe("parseJsonc", () => {
  test("strips line and block comments and trailing commas, but never touches // inside strings", () => {
    const text = '{\n  // a comment\n  "url": "https://a.b/v1", /* block */\n  "list": [1, 2,],\n}'
    expect(parseJsonc(text)).toEqual({ url: "https://a.b/v1", list: [1, 2] })
  })
})

describe("lintManagedConfig", () => {
  test("accepts a complete, locked-down config", () => {
    expect(lintManagedConfig(JSON.stringify(good))).toEqual([])
  })
  test("rejects a placeholder or non-https or loopback gateway URL", () => {
    expect(lint((c) => (c.provider["company-gateway"].options.baseURL = "https://REPLACE-WITH-YOUR-GATEWAY/v1"))[0]).toContain("placeholder")
    expect(lint((c) => (c.provider["company-gateway"].options.baseURL = "http://llm.simplifyx.example/v1"))[0]).toContain("https")
    expect(lint((c) => (c.provider["company-gateway"].options.baseURL = "https://127.0.0.1:4000/v1"))[0]).toContain("loopback")
    expect(lint((c) => (c.provider["company-gateway"].options.baseURL = "https://localhost:4000/v1"))[0]).toContain("loopback")
  })
  test("rejects an unpinned git plugin: a moving branch would change what every machine runs overnight", () => {
    expect(lint((c) => (c.plugin = ["superpowers@git+https://github.com/obra/superpowers.git"]))[0]).toContain("pinned")
    expect(lint((c) => (c.plugin = ["superpowers@git+https://github.com/obra/superpowers.git#v6.3.0", "@devtheops/opencode-plugin-otel"]))).toEqual([])
  })
  test("rejects a literal secret, accepts {env:} and {file:} references", () => {
    expect(lint((c) => (c.provider["company-gateway"].options.apiKey = "sk-live-abcdef123456"))[0]).toContain("literal secret")
    expect(lint((c) => (c.provider["company-gateway"].options.apiKey = "{env:GATEWAY_KEY}"))).toEqual([])
  })
  test("requires sharing and self-update to be off", () => {
    expect(lint((c) => (c.share = "manual"))[0]).toContain('"share"')
    expect(lint((c) => delete c.share)[0]).toContain('"share"')
    expect(lint((c) => (c.autoupdate = true))[0]).toContain('"autoupdate"')
  })
  test("requires deny-all first, then an allow for exactly the configured providers", () => {
    expect(lint((c) => delete c.experimental)[0]).toContain("deny")
    expect(lint((c) => c.experimental.policies.reverse())[0]).toContain("first")
    expect(lint((c) => c.experimental.policies.pop())[0]).toContain('no allow policy for provider "company-gateway"')
    expect(lint((c) => c.experimental.policies.push({ effect: "allow", action: "provider.use", resource: "openai" }))[0]).toContain('"openai"')
  })
  test("requires enabled_providers, the lock the released 1.18.x builds actually enforce", () => {
    // Verified against the real binary: with only experimental.policies, `opencode models` still offered the
    // built-in "opencode" provider, because policies are read by upstream's new core and not yet by the
    // provider list the shipping CLI and desktop app use. enabled_providers is what locks them today.
    expect(lint((c) => delete c.enabled_providers)[0]).toContain("enabled_providers")
    expect(lint((c) => c.enabled_providers.push("opencode"))[0]).toContain('"opencode"')
    expect(lint((c) => (c.enabled_providers = []))[0]).toContain("enabled_providers")
  })

  test("requires default models to exist and the whitelist to match the defined models", () => {
    expect(lint((c) => (c.model = "company-gateway/nope"))[0]).toContain('"model"')
    expect(lint((c) => (c.small_model = "other/bulk"))[0]).toContain('"small_model"')
    expect(lint((c) => c.provider["company-gateway"].whitelist.push("ghost"))[0]).toContain("whitelist")
    expect(lint((c) => delete c.provider["company-gateway"].whitelist)[0]).toContain("whitelist")
  })
  test("reports unparseable input instead of throwing", () => {
    expect(lintManagedConfig("{ not json")[0]).toContain("not valid JSON")
  })
})

describe("the shipped draft, managed/simplify-code.jsonc", () => {
  const text = readFileSync(path.join(import.meta.dir, "../managed/simplify-code.jsonc"), "utf8")
  test("is deployable except for the one thing only IT knows: the gateway URL", () => {
    const problems = lintManagedConfig(text)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("placeholder")
  })
  test("declares the required plugins that cannot be shipped inside the app", () => {
    const config = parseJsonc(text) as any
    // superpowers is vendored into the team folder (it has no native dependencies); otel is 357 MB of
    // platform-specific native modules and must be installed per machine, so it stays here
    expect(config.plugin).toEqual(["@devtheops/opencode-plugin-otel"])
  })
  test("carries the four gateway models and the current defaults", () => {
    const config = parseJsonc(text) as any
    expect(Object.keys(config.provider["company-gateway"].models)).toEqual(["bulk", "bulk-light", "escalate", "frontier"])
    expect(config.model).toBe("company-gateway/bulk")
    expect(config.small_model).toBe("company-gateway/bulk-light")
  })
})

describe("connectors (mcp) in the managed config", () => {
  test("a complete connector with its ask rule is accepted", () => {
    expect(lint(() => {})).toEqual([])
  })

  test("an enabled remote connector needs a real https address", () => {
    expect(lint((c) => (c.mcp.atlassian.url = "http://mcp.example.internal/mcp"))[0]).toContain('connector "atlassian": url must use https')
    expect(lint((c) => (c.mcp.atlassian.url = "https://REPLACE-WITH-YOUR-ORG.example/mcp"))[0]).toContain("placeholder")
    expect(lint((c) => (c.mcp.atlassian.url = "https://localhost:8931/mcp"))[0]).toContain("loopback")
    expect(lint((c) => delete c.mcp.atlassian.url)[0]).toContain('connector "atlassian": a remote connector needs a url')
  })

  test("a DISABLED connector may still carry placeholders: it is a template awaiting an admin registration", () => {
    expect(
      lint((c) => {
        c.mcp.salesforce = { type: "remote", url: "https://REPLACE-WITH-YOUR-ORG.example/mcp", enabled: false }
      }),
    ).toEqual([])
  })

  test("every enabled connector must ask before running its tools: the app's own default is to allow", () => {
    expect(lint((c) => delete c.permission)[0]).toContain('"atlassian_*": "ask"')
    expect(lint((c) => (c.permission = { "atlassian_*": "allow" }))[0]).toContain('"atlassian_*": "ask"')
    // a hyphenated key keeps its hyphen in tool names
    expect(
      lint((c) => {
        c.mcp["azure-devops"] = { type: "remote", url: "https://mcp.dev.azure.com/acme", enabled: true }
      })[0],
    ).toContain('"azure-devops_*": "ask"')
  })

  test("a read-only allow rule must come after the ask rule, because the last matching rule wins", () => {
    expect(lint((c) => (c.permission = { "atlassian_search*": "allow", "atlassian_*": "ask" }))[0]).toContain("comes before")
    expect(lint((c) => (c.permission = { "atlassian_*": "ask", "atlassian_search*": "allow" }))).toEqual([])
  })

  test("no rule may allow every tool of a connector", () => {
    expect(lint((c) => (c.permission = { "atlassian_*": "ask", "*": "allow" }))[0]).toContain("allows every tool")
  })

  test("a literal token in headers or oauth is rejected; references are fine", () => {
    expect(lint((c) => (c.mcp.atlassian.headers = { Authorization: "Bearer abc123" }))[0]).toContain("literal secret")
    expect(lint((c) => (c.mcp.atlassian.oauth = { clientId: "abc", clientSecret: "shh" }))[0]).toContain("literal secret")
    expect(lint((c) => (c.mcp.atlassian.oauth = { clientId: "abc", clientSecret: "{file:~/.config/simplifyx/atlassian-secret}" }))).toEqual([])
  })

  test("an enabled OAuth clientId that is still a placeholder is rejected", () => {
    expect(lint((c) => (c.mcp.atlassian.oauth = { clientId: "REPLACE-WITH-CLIENT-ID" }))[0]).toContain("clientId is still a placeholder")
  })

  test("a local connector's package must be pinned to an exact version", () => {
    const local = (command: string[]) => (c: any) => {
      c.mcp.outlook = { type: "local", command, enabled: true }
      c.permission["outlook_*"] = "ask"
    }
    expect(lint(local(["npx", "-y", "@softeria/ms-365-mcp-server"]))[0]).toContain("not pinned")
    expect(lint(local(["npx", "-y", "@softeria/ms-365-mcp-server@latest"]))[0]).toContain("not pinned")
    expect(lint(local(["npx", "-y", "@softeria/ms-365-mcp-server@1.4.2"]))).toEqual([])
    expect(lint(local(["uvx", "some-server"]))[0]).toContain("not pinned")
    expect(lint(local(["uvx", "some-server==2.0.1"]))).toEqual([])
    expect(lint(local(["/opt/company/bin/outlook-mcp"]))).toEqual([]) // an installed binary is the company's own
  })
})

describe("the shipped connectors", () => {
  const text = readFileSync(path.join(import.meta.dir, "../managed/simplify-code.jsonc"), "utf8")
  const config = parseJsonc(text) as any

  test("Atlassian and Slack are enabled: their hosted servers need no per-app registration on our side", () => {
    expect(config.mcp.atlassian).toEqual({ type: "remote", url: "https://mcp.atlassian.com/v2/mcp", enabled: true })
    expect(config.mcp.slack).toEqual({ type: "remote", url: "https://mcp.slack.com/mcp", enabled: true })
  })

  test("each enabled connector asks before running any tool", () => {
    expect(config.permission["atlassian_*"]).toBe("ask")
    expect(config.permission["slack_*"]).toBe("ask")
    // and the whole file still lints clean apart from the gateway placeholder
    expect(lintManagedConfig(text)).toHaveLength(1)
  })

  test("connectors that need an admin registration are NOT in the shipped config: a disabled entry would still show in the menu and fail when switched on", () => {
    for (const pending of ["azure-devops", "salesforce", "servicenow", "outlook"]) expect(config.mcp[pending]).toBeUndefined()
  })
})

describe("managed/connectors.pending.jsonc: templates for the connectors awaiting registration", () => {
  const templates = parseJsonc(readFileSync(path.join(import.meta.dir, "../managed/connectors.pending.jsonc"), "utf8")) as any

  test("covers Azure DevOps, Salesforce, ServiceNow and Outlook, each disabled and each with the permission rule it will need", () => {
    for (const name of ["azure-devops", "salesforce", "servicenow", "outlook"]) {
      expect(templates.mcp[name]).toBeDefined()
      expect(templates.mcp[name].enabled).toBe(false)
      expect(templates.permission[`${name}_*`]).toBe("ask")
    }
  })

  test("moving a template into the managed file with its placeholders filled in lints clean", () => {
    const filled = structuredClone(good) as any
    filled.mcp["azure-devops"] = { ...templates.mcp["azure-devops"], url: "https://mcp.dev.azure.com/acme", enabled: true }
    filled.permission["azure-devops_*"] = templates.permission["azure-devops_*"]
    expect(lintManagedConfig(JSON.stringify(filled))).toEqual([])
  })

  test("un-filled, an enabled template is rejected, so nobody ships a placeholder by moving it and forgetting to edit", () => {
    const raw = structuredClone(good) as any
    raw.mcp.salesforce = { ...templates.mcp.salesforce, enabled: true }
    raw.permission["salesforce_*"] = "ask"
    expect(lintManagedConfig(JSON.stringify(raw)).some((p) => p.includes("placeholder"))).toBe(true)
  })
})

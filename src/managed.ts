/**
 * Checks a company-managed opencode.json(c) before it is pushed to every developer machine.
 *
 * A managed config sits above user and project config and cannot be overridden, so a mistake in
 * it breaks everyone at once and cannot be fixed locally. lintManagedConfig returns the list of
 * problems (empty means deployable); it never throws.
 */

/** Parse JSON with // and block comments and trailing commas. Comment markers inside strings are left alone. */
export function parseJsonc(text: string): unknown {
  let out = ""
  let i = 0
  let inString = false
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (inString) {
      out += ch
      if (ch === "\\") {
        out += next ?? ""
        i += 2
        continue
      }
      if (ch === '"') inString = false
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i++
      continue
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++
      continue
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    out += ch
    i++
  }
  // trailing commas: a comma followed only by whitespace before } or ]
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"))
}

const SECRET_KEY = /key|token|secret|password|authorization/i
const REFERENCE = /^\{(env|file):[^}]+\}$/
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)$/i

type Dict = Record<string, unknown>
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v)

function secretProblems(value: unknown, at: string, problems: string[]): void {
  if (!isDict(value)) return
  for (const [key, v] of Object.entries(value)) {
    const where = `${at}.${key}`
    if (typeof v === "string" && SECRET_KEY.test(key) && !REFERENCE.test(v)) {
      problems.push(`${where} is a literal secret; every user on every machine can read a managed file. Use {file:...} or {env:...} instead`)
    } else {
      secretProblems(v, where, problems)
    }
  }
}

export function lintManagedConfig(text: string): string[] {
  let config: unknown
  try {
    config = parseJsonc(text)
  } catch (e) {
    return [`not valid JSON/JSONC: ${e instanceof Error ? e.message : String(e)}`]
  }
  if (!isDict(config)) return ["not valid JSON/JSONC: the top level must be an object"]
  const problems: string[] = []

  // Providers: reachable over https, not a placeholder, not this machine, models pinned.
  const providers = isDict(config.provider) ? config.provider : {}
  const providerIds = Object.keys(providers)
  if (providerIds.length === 0) problems.push('"provider" defines no provider; developers would have no model to use')
  for (const id of providerIds) {
    const p = providers[id]
    if (!isDict(p)) continue
    const baseURL = isDict(p.options) ? p.options.baseURL : undefined
    if (typeof baseURL === "string") {
      if (/replace|example\.com|your-/i.test(baseURL)) {
        problems.push(`provider "${id}": baseURL ${JSON.stringify(baseURL)} is still a placeholder; set the real gateway address`)
      } else {
        let url: URL | undefined
        try {
          url = new URL(baseURL)
        } catch {
          problems.push(`provider "${id}": baseURL ${JSON.stringify(baseURL)} is not a valid URL`)
        }
        if (url && LOOPBACK.test(url.hostname)) {
          problems.push(`provider "${id}": baseURL points at a loopback address (${url.hostname}); that only works on the machine running the gateway`)
        } else if (url && url.protocol !== "https:") {
          problems.push(`provider "${id}": baseURL must use https so prompts and code are encrypted in transit`)
        }
      }
    }
    const models = isDict(p.models) ? Object.keys(p.models) : []
    const whitelist = Array.isArray(p.whitelist) ? (p.whitelist as unknown[]).map(String) : undefined
    if (!whitelist) {
      problems.push(`provider "${id}": no whitelist; without it the gateway's other models can appear in the picker`)
    } else if ([...whitelist].sort().join() !== [...models].sort().join()) {
      problems.push(`provider "${id}": whitelist [${whitelist.join(", ")}] does not match the defined models [${models.join(", ")}]`)
    }
  }
  secretProblems(config, "config", problems)

  // Defaults must point at something that exists.
  for (const key of ["model", "small_model"] as const) {
    const ref = config[key]
    if (typeof ref !== "string") {
      problems.push(`"${key}" is not set; every developer would have to pick a model by hand`)
      continue
    }
    const [provider, ...rest] = ref.split("/")
    const p = providers[provider]
    if (!isDict(p) || !isDict(p.models) || !(rest.join("/") in p.models)) {
      problems.push(`"${key}" is ${JSON.stringify(ref)}, which is not a model defined in this file`)
    }
  }

  // Data must not leave the company; versions are delivered by IT.
  if (config.share !== "disabled") problems.push('"share" must be "disabled"; otherwise /share uploads conversations to opencode.ai')
  if (config.autoupdate !== false) problems.push('"autoupdate" must be false; new versions are delivered by the rebrand pipeline, not by self-update')

  // Provider lock, part 1: enabled_providers. This is the lock the released 1.18.x CLI and desktop app
  // actually enforce. Verified against the real binary: with policies alone, the built-in "opencode"
  // provider (OpenCode Zen, which sends prompts outside the company) was still offered.
  const enabled = Array.isArray(config.enabled_providers) ? (config.enabled_providers as unknown[]).map(String) : undefined
  if (!enabled || enabled.length === 0) {
    problems.push('"enabled_providers" must list the configured providers; it is the provider lock that released builds enforce, and without it the built-in "opencode" provider stays available')
  } else {
    for (const id of enabled) if (!providerIds.includes(id)) problems.push(`"enabled_providers" includes "${id}", which is not a provider defined in this file`)
    for (const id of providerIds) if (!enabled.includes(id)) problems.push(`"enabled_providers" does not include "${id}", so developers could not use it`)
  }

  // Provider lock, part 2: policies, upstream's documented successor, read by its new core. Kept so the
  // lock survives the release where upstream switches over. Deny everything first (the last matching
  // policy wins), then allow exactly what is configured.
  const policies = isDict(config.experimental) && Array.isArray(config.experimental.policies) ? (config.experimental.policies as Dict[]) : []
  const providerPolicies = policies.filter((s) => isDict(s) && s.action === "provider.use")
  const denyAll = providerPolicies.findIndex((s) => s.effect === "deny" && s.resource === "*")
  if (denyAll === -1) {
    problems.push('experimental.policies has no { "effect": "deny", "action": "provider.use", "resource": "*" }; any provider a developer adds would work')
  } else if (denyAll !== 0) {
    problems.push("the deny-all provider policy must come first; the last matching policy wins, so an earlier allow would be cancelled by it")
  }
  const allowed = providerPolicies.filter((s) => s.effect === "allow").map((s) => String(s.resource))
  for (const id of providerIds) if (!allowed.includes(id)) problems.push(`no allow policy for provider "${id}"; deny-all would block it`)
  for (const id of allowed) if (!providerIds.includes(id)) problems.push(`allow policy for "${id}", which is not a provider defined in this file`)

  return problems
}

#!/usr/bin/env bun
// End-to-end check of the brand config names against a REAL built binary.
//
//   bun run script/e2e-config.ts [path-to-opencode]      default: `opencode` on PATH
//
// The config-name transforms change behaviour, so string checks on the patched source are not
// enough. Each case gets a throwaway home (XDG_* point into a temp folder, so the real
// ~/.config/opencode is never read or written), runs `opencode debug config`, and asserts on the
// resolved result. Exit 0 only if every case passes.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { loadBrand, placeholders } from "../src/brand"

const bin = process.argv[2] ?? "opencode"
const BRAND = placeholders(loadBrand()).productSlug

interface Sandbox {
  root: string
  config: string
  project: string
  write(file: string, value: unknown): void
  resolved(cwd?: string, env?: Record<string, string>): Promise<Record<string, any>>
  run(args: string[], cwd?: string): Promise<string>
}

function sandbox(): Sandbox {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "simplify-code-e2e-")))
  const config = path.join(root, "config")
  const project = path.join(root, "project")
  for (const d of [config, project, path.join(root, "data"), path.join(root, "cache"), path.join(root, "state")]) mkdirSync(d, { recursive: true })
  const env = (extra: Record<string, string> = {}) => ({
    ...process.env,
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_STATE_HOME: path.join(root, "state"),
    OPENCODE_TEST_HOME: root, // upstream's own hook: keeps the ~/.opencode lookup inside the sandbox
    OPENCODE_TEST_MANAGED_CONFIG_DIR: path.join(root, "no-managed"),
    OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR: path.join(root, "no-brand-managed"),
    OPENCODE_TEST_BRAND_TEAM_CONFIG_DIR: path.join(root, "no-team"),
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    ...extra,
  })
  return {
    root,
    config,
    project,
    write(file, value) {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2))
    },
    async resolved(cwd = project, extra = {}) {
      // to a file, not a pipe: the CLI can exit before a large piped write is flushed
      const out = path.join(root, `resolved-${Math.random().toString(36).slice(2)}.json`)
      await $`sh -c ${`"${bin}" debug config > "${out}" 2>/dev/null`}`.cwd(cwd).env(env(extra)).quiet().nothrow()
      const raw = readFileSync(out, "utf8")
      return JSON.parse(raw.slice(raw.indexOf("{")))
    },
    async run(args, cwd = project) {
      return await $`${bin} ${args}`.cwd(cwd).env(env()).quiet().nothrow().text()
    },
  }
}

const results: { name: string; ok: boolean; detail: string }[] = []
async function check(name: string, fn: (s: Sandbox) => Promise<string | undefined>) {
  const s = sandbox()
  try {
    const problem = await fn(s)
    results.push({ name, ok: !problem, detail: problem ?? "" })
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) })
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
}
const expectEq = (what: string, actual: unknown, expected: unknown) =>
  JSON.stringify(actual) === JSON.stringify(expected) ? undefined : `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`

await check(`~/.config/${BRAND}/${BRAND}.json alone is picked up`, async (s) => {
  s.write(path.join(s.config, BRAND, `${BRAND}.json`), { model: "brand/global" })
  return expectEq("model", (await s.resolved()).model, "brand/global")
})

await check(`${BRAND}.json beats opencode.json, and the two are merged, not swapped`, async (s) => {
  s.write(path.join(s.config, "opencode", "opencode.json"), { model: "upstream/global", small_model: "upstream/small" })
  s.write(path.join(s.config, BRAND, `${BRAND}.json`), { model: "brand/global" })
  const c = await s.resolved()
  return expectEq("model", c.model, "brand/global") ?? expectEq("small_model", c.small_model, "upstream/small")
})

await check("an existing opencode.json alone still works, and no brand folder is created beside it", async (s) => {
  s.write(path.join(s.config, "opencode", "opencode.json"), { model: "upstream/global" })
  const c = await s.resolved()
  return expectEq("model", c.model, "upstream/global") ?? expectEq(`~/.config/${BRAND} exists`, existsSync(path.join(s.config, BRAND)), false)
})

await check(`a fresh install is seeded with ~/.config/${BRAND}/${BRAND}.jsonc`, async (s) => {
  await s.resolved()
  return (
    expectEq("brand seed exists", existsSync(path.join(s.config, BRAND, `${BRAND}.jsonc`)), true) ??
    expectEq("upstream seed exists", existsSync(path.join(s.config, "opencode", "opencode.jsonc")), false)
  )
})

await check(`in a project, ${BRAND}.json beats opencode.json in the same folder`, async (s) => {
  s.write(path.join(s.project, "opencode.json"), { model: "upstream/project" })
  s.write(path.join(s.project, `${BRAND}.json`), { model: "brand/project" })
  return expectEq("model", (await s.resolved()).model, "brand/project")
})

await check("but a closer folder still beats an outer one, whatever the file is called", async (s) => {
  const sub = path.join(s.project, "packages", "app")
  s.write(path.join(s.project, `${BRAND}.json`), { model: "brand/outer" })
  s.write(path.join(sub, "opencode.json"), { model: "upstream/inner" })
  return expectEq("model", (await s.resolved(sub)).model, "upstream/inner")
})

await check(`.${BRAND}/ works as a project folder: its config and its agents are loaded`, async (s) => {
  s.write(path.join(s.project, `.${BRAND}`, `${BRAND}.json`), { share: "disabled" })
  s.write(path.join(s.project, `.${BRAND}`, "agents", "brandreviewer.md"), "---\ndescription: e2e probe agent\nmode: subagent\n---\nYou review code.\n")
  const c = await s.resolved()
  const agents = await s.run(["agent", "list"])
  return expectEq("share", c.share, "disabled") ?? expectEq("agent listed", agents.includes("brandreviewer"), true)
})

await check("the brand managed folder overrides a developer's own brand config", async (s) => {
  const managed = path.join(s.root, "brand-managed")
  s.write(path.join(managed, `${BRAND}.json`), { share: "disabled" })
  s.write(path.join(s.config, BRAND, `${BRAND}.json`), { share: "manual" })
  const c = await s.resolved(s.project, { OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR: managed })
  return expectEq("share", c.share, "disabled")
})

// Regression: `mv ~/.config/opencode ~/.config/simplify-code` is the advertised way to migrate, and it leaves a file
// still NAMED opencode.json inside the brand folder. The first version of the loader did not read it.
await check(`after moving the whole folder, an opencode.json inside ~/.config/${BRAND} is still read`, async (s) => {
  s.write(path.join(s.config, BRAND, "opencode.json"), { model: "moved/global", small_model: "moved/small" })
  const c = await s.resolved()
  return expectEq("model", c.model, "moved/global") ?? expectEq("small_model", c.small_model, "moved/small")
})

await check("and the emptied upstream folder is not refilled with a .gitignore, package.json or node_modules", async (s) => {
  s.write(path.join(s.config, BRAND, `${BRAND}.json`), { model: "brand/global" })
  await s.resolved()
  await s.run(["models"])
  const upstream = path.join(s.config, "opencode")
  const refilled = [".gitignore", "package.json", "node_modules"].filter((f) => existsSync(path.join(upstream, f)))
  return expectEq("files recreated in ~/.config/opencode", refilled, [])
})

// Company control: an administrator-owned team folder and the plugin lock.
await check("the team folder's agents, commands and config load on every machine", async (s) => {
  const team = path.join(s.root, "managed-brand", "team")
  s.write(path.join(team, "agents", "teamreviewer.md"), "---\ndescription: e2e team agent\nmode: subagent\n---\nYou review for the team.\n")
  s.write(path.join(team, `${BRAND}.json`), { share: "disabled" })
  const env = { OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR: path.join(s.root, "managed-brand"), OPENCODE_TEST_BRAND_TEAM_CONFIG_DIR: team }
  const c = await s.resolved(s.project, env)
  const out = path.join(s.root, "agents.txt")
  await $`sh -c ${`"${bin}" agent list > "${out}" 2>/dev/null`}`.cwd(s.project).env({ ...process.env, ...env, XDG_CONFIG_HOME: s.config, OPENCODE_TEST_HOME: s.root }).quiet().nothrow()
  return expectEq("share", c.share, "disabled") ?? expectEq("team agent listed", readFileSync(out, "utf8").includes("teamreviewer"), true)
})

await check("a read-only team folder still loads (the app only warns when it cannot write there)", async (s) => {
  const team = path.join(s.root, "managed-brand", "team")
  s.write(path.join(team, `${BRAND}.json`), { share: "disabled" })
  await $`chmod -R a-w ${path.join(s.root, "managed-brand")}`.quiet()
  const c = await s.resolved(s.project, { OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR: path.join(s.root, "managed-brand"), OPENCODE_TEST_BRAND_TEAM_CONFIG_DIR: team })
  await $`chmod -R u+w ${path.join(s.root, "managed-brand")}`.quiet()
  return expectEq("share", c.share, "disabled") ?? expectEq("no .gitignore forced into the team folder", existsSync(path.join(team, ".gitignore")), false)
})

await check("plugins: the managed list is merged with a developer's own, and the lock marker drops the developer's", async (s) => {
  const managed = path.join(s.root, "managed-brand")
  s.write(path.join(managed, `${BRAND}.json`), { plugin: ["file:///nonexistent/company-plugin.js"] })
  s.write(path.join(s.config, BRAND, `${BRAND}.json`), { plugin: ["file:///nonexistent/personal-plugin.js"] })
  const env = { OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR: managed, OPENCODE_TEST_BRAND_TEAM_CONFIG_DIR: path.join(managed, "team") }
  const open = ((await s.resolved(s.project, env)).plugin ?? []).map((p: string) => path.basename(p)).sort()
  s.write(path.join(managed, "plugin-lock"), "")
  const locked = ((await s.resolved(s.project, env)).plugin ?? []).map((p: string) => path.basename(p)).sort()
  return (
    expectEq("without lock", open, ["company-plugin.js", "personal-plugin.js"]) ??
    expectEq("with lock", locked, ["company-plugin.js"])
  )
})

await check("a gateway key file that does not exist yet does not stop the app when the reference is in the managed config", async (s) => {
  const managed = path.join(s.root, "managed-brand")
  s.write(path.join(managed, `${BRAND}.json`), {
    provider: { gw: { npm: "@ai-sdk/openai-compatible", name: "gw", options: { baseURL: "https://gw.example/v1", apiKey: `{file:${s.root}/no-such-key}` }, models: { m: { name: "m" } } } },
  })
  const c = await s.resolved(s.project, { OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR: managed, OPENCODE_TEST_BRAND_TEAM_CONFIG_DIR: path.join(managed, "team") })
  return expectEq("provider loaded with an empty key", c.provider?.gw?.options?.apiKey, "")
})

// But in a developer's own file the upstream behaviour stays: a bad reference is an error they should see.
await check("the same missing file in a developer's own config is still reported as an error", async (s) => {
  s.write(path.join(s.config, BRAND, `${BRAND}.json`), { provider: { gw: { options: { apiKey: `{file:${s.root}/no-such-key}` } } } })
  const out = await s.run(["debug", "config"])
  return expectEq("error mentions the reference", out.includes("bad file reference"), true)
})

const version = (await $`${bin} --version`.quiet().nothrow().text()).trim()
console.log(`\nconfig names, end to end, against ${bin} ${version}\n`)
for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `\n        ${r.detail}`}`)
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)

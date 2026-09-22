import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { loadBrand } from "../src/brand"
import { installTeamPs1, installTeamSh, PLUGIN_LOCK_SOURCE, stageCompanySet, teamInstallGuide, TEAM_DIR, writeTeamBundle } from "../src/team-bundle"

const brand = loadBrand()

describe("the team folder in the repo", () => {
  test("holds agents, commands, skills and local plugins, and none of the app's generated files", () => {
    const entries = readdirSync(TEAM_DIR).sort()
    expect(entries).toEqual(["agents", "commands", "plugins", "skills"])
    for (const rel of ["node_modules", "package.json", ".gitignore", "simplify-code.json", "opencode.json"]) {
      expect(existsSync(path.join(TEAM_DIR, rel))).toBe(false)
    }
    // the local plugins need their own dependencies, and the app does not install those
    expect(existsSync(path.join(TEAM_DIR, "plugins", "package.json"))).toBe(true)
    expect(existsSync(path.join(TEAM_DIR, "plugins", "package-lock.json"))).toBe(true)
  })

  test("carries impeccable's OpenCode build, vendored with its licence and source tag", () => {
    const skill = path.join(TEAM_DIR, "skills", "impeccable")
    for (const f of ["SKILL.md", "LICENSE", "NOTICE.md", "VENDORED.md"]) expect(existsSync(path.join(skill, f))).toBe(true)
    expect(readFileSync(path.join(skill, "SKILL.md"), "utf8")).toMatch(/^name: impeccable$/m)
    expect(readFileSync(path.join(skill, "VENDORED.md"), "utf8")).toMatch(/at tag skill-v\d+\.\d+\.\d+/)
    expect(existsSync(path.join(TEAM_DIR, "commands", "impeccable.md"))).toBe(true)
    // its four agents are Claude Code specific and impeccable's own OpenCode build leaves them out
    expect(existsSync(path.join(TEAM_DIR, "agents", "impeccable-finish-reviewer.md"))).toBe(false)
  })

  test("carries no literal secret", () => {
    const files = readdirSync(TEAM_DIR, { recursive: true }) as string[]
    for (const rel of files) {
      const file = path.join(TEAM_DIR, rel)
      if (!statSync(file).isFile()) continue
      const text = readFileSync(file, "utf8")
      expect(text).not.toMatch(/sk-[A-Za-z0-9]{16,}/)
      expect(text).not.toMatch(/(api[_-]?key|secret|password)\s*[:=]\s*["'][A-Za-z0-9+/_-]{16,}["']/i)
    }
  })
})

describe("installTeamSh", () => {
  const script = installTeamSh(brand)

  test("is valid sh, needs root, and installs into the managed folder for the platform", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "team-sh-"))
    writeFileSync(path.join(dir, "i.sh"), script)
    expect((await $`sh -n ${path.join(dir, "i.sh")}`.quiet().nothrow()).exitCode).toBe(0)
    rmSync(dir, { recursive: true, force: true })
    expect(script).toContain('"/Library/Application Support/simplify-code"')
    expect(script).toContain('"/etc/simplify-code"')
    expect(script).toContain("run this with sudo")
  })

  test("makes the result administrator-owned and world-readable, and supports the plugin lock", () => {
    expect(script).toContain("chown -R root:")
    expect(script).toContain("chmod -R u=rwX,go=rX")
    expect(script).toContain("--plugin-lock")
    expect(script).toContain('touch "$ROOT/plugin-lock"')
    expect(script).toContain('rm -f "$ROOT/plugin-lock"')
  })

  test("replaces the team folder wholesale, so a removed skill really disappears, but never touches developers' homes", () => {
    expect(script).toContain('rm -rf "$ROOT/team"')
    expect(script).not.toContain("$HOME")
    expect(script).not.toContain("~/")
  })

  test.skipIf(process.platform === "win32")("installs a real bundle into an overridden root, end to end", async () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "team-e2e-")))
    const bundle = path.join(dir, "bundle")
    await writeTeamBundle(bundle, brand, "2026-09-22", { installPlugins: false })
    const root = path.join(dir, "root")
    const r = await $`sh ${path.join(bundle, "install-team.sh")} --plugin-lock`.env({ ...process.env, SIMPLIFY_CODE_TEAM_ROOT: root }).quiet().nothrow()
    expect(r.exitCode).toBe(0)
    expect(existsSync(path.join(root, "simplify-code.jsonc"))).toBe(true)
    expect(existsSync(path.join(root, "team", "agents", "code-reviewer.md"))).toBe(true)
    expect(existsSync(path.join(root, "team", "plugins", "ciso-session.js"))).toBe(true)
    expect(existsSync(path.join(root, "plugin-lock"))).toBe(true)
    // a second run without the flag removes the lock and leaves everything else in place
    const again = await $`sh ${path.join(bundle, "install-team.sh")}`.env({ ...process.env, SIMPLIFY_CODE_TEAM_ROOT: root }).quiet().nothrow()
    expect(again.exitCode).toBe(0)
    expect(existsSync(path.join(root, "plugin-lock"))).toBe(false)
    expect(existsSync(path.join(root, "team", "skills"))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)
})

describe("installTeamPs1", () => {
  const script = installTeamPs1(brand)
  test("uses Windows line endings, requires elevation, installs under ProgramData and locks the ACL", () => {
    expect(script).toContain("\r\n")
    expect(script.replaceAll("\r\n", "")).not.toContain("\n")
    expect(script).toContain("#Requires -RunAsAdministrator")
    expect(script).toContain("$env:ProgramData")
    expect(script).toContain("simplify-code")
    expect(script).toContain("icacls")
    expect(script).toContain("-PluginLock")
  })
})

describe("teamInstallGuide", () => {
  const guide = teamInstallGuide(brand, "2026-09-22")
  test("explains what is enforced, what is shared, and that developers' home folders are never touched", () => {
    expect(guide).toContain("simplify-code.jsonc")
    expect(guide).toContain("team/")
    expect(guide).toContain("plugin-lock")
    expect(guide).toContain("sudo sh install-team.sh")
    expect(guide).toContain("home")
    expect(guide).toContain("gateway-key")
  })
})

describe("writeTeamBundle", () => {
  test("writes the managed config, the team archive, both installers, a guide and checksums", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "team-bundle-"))
    const files = await writeTeamBundle(out, brand, "2026-09-22", { installPlugins: false })
    expect(files.map((f) => path.basename(f)).sort()).toEqual(
      ["INSTALL.md", "SHA256SUMS", "install-team.ps1", "install-team.sh", "simplify-code.jsonc", "team.zip"].sort(),
    )
    const listing = await $`unzip -l ${path.join(out, "team.zip")}`.quiet().text()
    expect(listing).toContain("team/agents/code-reviewer.md")
    expect(listing).toContain("team/plugins/package.json")
    expect(listing).not.toContain(".DS_Store")
    rmSync(out, { recursive: true, force: true })
  })
})

describe("stageCompanySet: what the desktop app ships inside itself", () => {
  test("writes the enforced config, the team folder and the plugin-lock marker into one folder", async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), "company-")), "company")
    await stageCompanySet(out, brand, { installPlugins: false })
    expect(existsSync(path.join(out, "simplify-code.jsonc"))).toBe(true)
    expect(existsSync(path.join(out, "team", "skills", "impeccable", "SKILL.md"))).toBe(true)
    expect(existsSync(path.join(out, "team", "plugins", "ciso-session.js"))).toBe(true)
    // the lock ships whenever the repo carries the marker; the user chose the lock for the pilot
    expect(existsSync(PLUGIN_LOCK_SOURCE)).toBe(true)
    expect(existsSync(path.join(out, "plugin-lock"))).toBe(true)
    expect(existsSync(path.join(out, "team", ".DS_Store"))).toBe(false)
    rmSync(path.dirname(out), { recursive: true, force: true })
  })
  test("replaces a previous staging wholesale", async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), "company-")), "company")
    mkdirSync(path.join(out, "team", "skills", "stale"), { recursive: true })
    writeFileSync(path.join(out, "team", "skills", "stale", "SKILL.md"), "x")
    await stageCompanySet(out, brand, { installPlugins: false })
    expect(existsSync(path.join(out, "team", "skills", "stale"))).toBe(false)
    rmSync(path.dirname(out), { recursive: true, force: true })
  })
})

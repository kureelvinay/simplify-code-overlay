#!/usr/bin/env bun
import { appendFileSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { BRAND_DIR, loadBrand, placeholders, type Brand } from "./brand"
import { applyTransforms, cloneUpstream, TransformError } from "./rebrand"
import { TRANSFORMS } from "./transforms"
import { binaryName, hostPackage, packDir, rebrandPlatformPackages, writeMetaPackage } from "./package"
import { buildMacApp } from "./launcher"
import { archiveBinaries, writeBundle } from "./bundle"
import { buildDesktop, buildDesktopTargets, DESKTOP_TARGETS, DesktopBuildError, installDesktop, verifyDesktop, verifyWindowsDesktop } from "./desktop"
import { writeDesktopBundle } from "./desktop-bundle"
import { writeTeamBundle } from "./team-bundle"

export const EXIT = { input: 1, drift: 2, toolchain: 3, build: 4, smoke: 5, publish: 6 } as const

const ROOT = path.resolve(import.meta.dir, "..")
const WORK = path.join(ROOT, "work")
const DIST = path.join(ROOT, "dist")
const VERSION_RE = /^\d+\.\d+\.\d+$/

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message)
    this.name = "PipelineError"
  }
}

export interface Args {
  mode: "local" | "release" | "check" | "launcher" | "desktop" | "desktop-package" | "package" | "team-package"
  version?: string
  skipWebUi: boolean
}

const USAGE = "usage: bun run src/pipeline.ts --local|--package|--desktop-package|--team-package|--release|--check|--desktop|--launcher [--version X.Y.Z] [--skip-web-ui]"

export function parseArgs(argv: string[]): Args {
  const mode = (["--local", "--package", "--desktop-package", "--team-package", "--release", "--check", "--desktop", "--launcher"] as const).find((m) => argv.includes(m))
  if (!mode) throw new PipelineError(USAGE, EXIT.input)
  const i = argv.indexOf("--version")
  let version: string | undefined
  if (i >= 0) {
    // `--version` with nothing after it, or followed by another flag, is a typo, not "no version"
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) throw new PipelineError(`--version needs a value\n${USAGE}`, EXIT.input)
    version = next
  }
  if (version !== undefined && !VERSION_RE.test(version)) {
    throw new PipelineError(`version must look like 1.18.31, got ${JSON.stringify(version)}`, EXIT.input)
  }
  return { mode: mode.slice(2) as Args["mode"], version, skipWebUi: argv.includes("--skip-web-ui") }
}

/** Upstream's scripts need a Bun satisfying `^<packageManager pin>`: newer patches and minors are fine, older ones are not. */
export function checkBunVersion(upstreamRoot: string, actual: string = Bun.version): string {
  const pkg = JSON.parse(readFileSync(path.join(upstreamRoot, "package.json"), "utf8")) as { packageManager?: string }
  const expected = pkg.packageManager?.split("@")[1]
  if (!expected) throw new PipelineError("upstream package.json has no packageManager field", EXIT.toolchain)
  if (!Bun.semver.satisfies(actual, `^${expected}`)) {
    throw new PipelineError(
      `upstream needs bun ^${expected}, you have ${actual}.\n` +
        `Install it with: curl -fsSL https://bun.sh/install | bash -s "bun-v${expected}"`,
      EXIT.toolchain,
    )
  }
  return expected
}

/** Stable release versions from `upstream` that are newer than `current`, ascending. */
export function newerVersions(upstream: string[], current: string | undefined): string[] {
  return upstream
    .filter((v) => VERSION_RE.test(v))
    .filter((v) => current === undefined || Bun.semver.order(v, current) > 0)
    .sort(Bun.semver.order)
}

async function latestUpstreamVersion(brand: Brand): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${brand.upstreamRepo}/releases/latest`, {
    headers: { "user-agent": "simplify-code-overlay" },
  })
  if (!res.ok) throw new PipelineError(`GitHub API returned ${res.status} for ${brand.upstreamRepo}`, EXIT.input)
  const data = (await res.json()) as { tag_name: string }
  return data.tag_name.replace(/^v/, "")
}

/** Clone, verify Bun, install upstream's dependencies, apply the brand transforms. Shared by every build mode. */
export async function checkout(
  brand: Brand,
  version: string,
): Promise<{ upstreamRoot: string; env: Record<string, string | undefined> }> {
  console.log(`\n== ${brand.productName} ${version}: clone upstream ==`)
  const upstreamRoot = await cloneUpstream(brand.upstreamRepo, version, WORK).catch((e: unknown) => {
    throw new PipelineError(
      `could not clone ${brand.upstreamRepo} at tag v${version}: ${e instanceof Error ? e.message : String(e)}\n` +
        `  check that the tag exists: https://github.com/${brand.upstreamRepo}/releases/tag/v${version}`,
      EXIT.input,
    )
  })
  checkBunVersion(upstreamRoot)

  // node-gyp-build falls back to spawning `node-gyp`; without a resolvable binary Bun auto-fetches
  // node-gyp@latest, which is broken on Node 20. Put our pinned devDependency's binary on PATH first.
  // build.ts runs its own `bun install --os=* ...`, so it needs the same PATH.
  const binDir = path.join(ROOT, "node_modules", ".bin")
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` }

  console.log("\n== bun install (upstream dependencies) ==")
  const install = await $`bun install`.cwd(upstreamRoot).env(env).nothrow()
  if (install.exitCode !== 0) throw new PipelineError(`upstream bun install failed (exit ${install.exitCode})`, EXIT.build)

  console.log("\n== apply brand transforms ==")
  try {
    const changed = applyTransforms(upstreamRoot, TRANSFORMS, placeholders(brand), BRAND_DIR)
    for (const f of changed) console.log(`  rebranded ${f}`)
  } catch (e) {
    if (e instanceof TransformError) throw new PipelineError(e.message, EXIT.drift)
    throw e
  }

  return { upstreamRoot, env }
}

/** checkout + upstream's CLI build. Shared by --local and --release. */
export async function prepare(
  brand: Brand,
  version: string,
  opts: { single: boolean; skipWebUi: boolean },
): Promise<{ upstreamRoot: string; distDir: string }> {
  const { upstreamRoot, env } = await checkout(brand, version)

  console.log("\n== upstream build ==")
  const flags = [opts.single ? "--single" : "", opts.skipWebUi ? "--skip-embed-web-ui" : ""].filter(Boolean)
  const build = await $`bun run ./script/build.ts ${flags}`
    .cwd(path.join(upstreamRoot, "packages/opencode"))
    .env({ ...env, OPENCODE_VERSION: version, OPENCODE_CHANNEL: "latest" })
    .nothrow()
  if (build.exitCode !== 0) throw new PipelineError(`upstream build failed (exit ${build.exitCode})`, EXIT.build)

  return { upstreamRoot, distDir: path.join(upstreamRoot, "packages/opencode/dist") }
}

/** `--version` must print the version; the binary must embed the brand strings. */
export async function smokeTest(binary: string, version: string, brand: Brand): Promise<void> {
  const out = await $`${binary} --version`.nothrow().text()
  if (!out.includes(version)) {
    throw new PipelineError(`smoke: ${binary} --version printed ${JSON.stringify(out.trim())}, expected ${version}`, EXIT.smoke)
  }
  const bytes = readFileSync(binary)
  for (const needle of [brand.productName, brand.tagline]) {
    if (!bytes.includes(needle)) throw new PipelineError(`smoke: binary does not contain ${JSON.stringify(needle)}`, EXIT.smoke)
  }
  console.log(`smoke test passed: ${out.trim()}, brand strings present`)
}

export async function local(brand: Brand, version: string, skipWebUi: boolean): Promise<void> {
  const { upstreamRoot, distDir } = await prepare(brand, version, { single: true, skipWebUi })
  const platforms = rebrandPlatformPackages(distDir, brand, upstreamRoot)
  const host = hostPackage(platforms)
  await smokeTest(path.join(host.dir, "bin", binaryName(brand)), version, brand)

  console.log("\n== package for local install ==")
  const out = path.join(DIST, version, "local")
  rmSync(out, { recursive: true, force: true })
  const platformTgz = await packDir(host.dir, out)
  const metaDir = writeMetaPackage(distDir, brand, version, [host], upstreamRoot, {
    fileDeps: { [host.name]: `file:${platformTgz}` },
    outDirName: "meta-local",
  })
  const metaTgz = await packDir(metaDir, out)
  console.log(`  ${platformTgz}\n  ${metaTgz}`)

  console.log("\n== install globally ==")
  const stock = await $`npm ls -g opencode-ai --depth=0`.quiet().nothrow()
  if (stock.exitCode === 0) {
    console.log("  removing stock opencode-ai (reinstall later with: npm install -g opencode-ai)")
    const uninstall = await $`npm uninstall -g opencode-ai`.nothrow()
    if (uninstall.exitCode !== 0) console.log(`  warning: npm uninstall -g opencode-ai failed (exit ${uninstall.exitCode}), continuing`)
  }
  const installed = await $`npm install -g ${metaTgz}`.nothrow()
  if (installed.exitCode !== 0) {
    throw new PipelineError(
      `global install failed (exit ${installed.exitCode}).\n` +
        `  retry:         npm install -g ${metaTgz}\n` +
        `  restore stock: npm install -g opencode-ai`,
      EXIT.publish,
    )
  }
  // npm's own global bin dir is where our shim really landed; `which` only tells us what wins on PATH.
  const prefix = (await $`npm prefix -g`.quiet().nothrow().text()).trim()
  const npmBinDir = prefix ? (process.platform === "win32" ? prefix : path.join(prefix, "bin")) : ""
  const cmd = placeholders(brand).productSlug
  const lookup = process.platform === "win32" ? await $`where ${cmd}`.quiet().nothrow().text() : await $`which ${cmd}`.quiet().nothrow().text()
  const onPath = lookup.trim().split("\n")[0]?.trim() ?? ""
  const installedBin = npmBinDir ? path.join(npmBinDir, cmd) : onPath
  const ver = await $`${cmd} --version`.nothrow().text()
  console.log(`\n${brand.productName} ${brand.tagline} installed.\n  binary: ${installedBin}\n  version: ${ver.trim()}`)
  if (npmBinDir && onPath && path.dirname(onPath) !== npmBinDir) {
    console.log(
      `\nwarning: \`${cmd}\` on your PATH resolves to ${onPath}, not ${installedBin}.\n` +
        `  another install is shadowing this one.\n` +
        `  remove it, or put ${npmBinDir} first on PATH.`,
    )
  }
  console.log(`\nRun \`${cmd}\` to see the home screen.`)
}

/** macOS only: put `<productName> Terminal.app` in ~/Applications. Opt-in via --launcher; the desktop app is the default way in. */
export async function installLauncher(brand: Brand, version: string): Promise<string> {
  if (process.platform !== "darwin") throw new PipelineError("--launcher builds a macOS app and only runs on macOS", EXIT.input)
  const dest = path.join(homedir(), "Applications")
  mkdirSync(dest, { recursive: true })
  const app = await buildMacApp(dest, brand, version, `${BRAND_DIR}icon.png`)
  console.log(`\nlauncher installed: ${app}\n  open it from Launchpad, Spotlight, or: open ${JSON.stringify(app)}`)
  return app
}

/** Version for the launcher's Info.plist when none was given: whatever build is installed. */
async function installedVersion(brand: Brand): Promise<string> {
  const out = await $`${placeholders(brand).productSlug} --version`.quiet().nothrow().text()
  return out.match(/\d+\.\d+\.\d+/)?.[0] ?? "1.0.0"
}

async function registryLatest(brand: Brand): Promise<string | undefined> {
  const r = await $`npm view ${brand.npmPackage} version`.quiet().nothrow()
  if (r.exitCode === 0) return r.text().trim()
  // "not published yet" is a normal answer; anything else means we cannot trust the comparison.
  const stderr = r.stderr.toString()
  if (stderr.includes("E404")) return undefined
  throw new PipelineError(`registry unreachable or auth failed: ${stderr.trim().split("\n")[0] ?? "no stderr"}`, EXIT.input)
}

async function upstreamReleaseVersions(brand: Brand): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${brand.upstreamRepo}/releases?per_page=30`, {
    headers: { "user-agent": "simplify-code-overlay" },
  })
  if (!res.ok) throw new PipelineError(`GitHub API returned ${res.status} for ${brand.upstreamRepo}`, EXIT.input)
  const data = (await res.json()) as { tag_name: string; draft: boolean; prerelease: boolean }[]
  return data.filter((r) => !r.draft && !r.prerelease).map((r) => r.tag_name.replace(/^v/, ""))
}

async function check(brand: Brand): Promise<void> {
  const [upstream, current] = await Promise.all([upstreamReleaseVersions(brand), registryLatest(brand)])
  const newer = newerVersions(upstream, current)
  // One release job per version; cap the batch so a long backlog cannot fan out into a huge matrix.
  const batch = newer.slice(-3)
  if (newer.length > batch.length) {
    console.log(`note: ${newer.length - batch.length} older version(s) skipped, building the newest ${batch.length}`)
  }
  console.log(batch.length ? batch.join("\n") : "up to date")
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `versions=${JSON.stringify(batch)}\n`)
  }
}

async function signHook(distDir: string): Promise<void> {
  const hook = path.join(ROOT, "script", "sign.ts")
  if (!(await Bun.file(hook).exists())) return
  console.log("\n== sign hook ==")
  const r = await $`bun run ${hook} ${distDir}`.nothrow()
  if (r.exitCode !== 0) throw new PipelineError(`sign hook failed (exit ${r.exitCode})`, EXIT.build)
}

/** Archives every platform's bin/ for the GitHub release. Names what it could not archive on `failed`. */
async function release(brand: Brand, version: string): Promise<void> {
  // Publishing to npm is irreversible; a bad releaseRepo would only surface afterwards. Check it first.
  const repo = await $`gh repo view ${brand.releaseRepo}`.quiet().nothrow()
  if (repo.exitCode !== 0) {
    throw new PipelineError(
      `release repo ${brand.releaseRepo} is not reachable with this gh token (exit ${repo.exitCode}).\n` +
        `  brand/brand.json ships a placeholder; set "releaseRepo" to the real internal repo and give the token contents:write on it.`,
      EXIT.input,
    )
  }
  const { upstreamRoot, distDir } = await prepare(brand, version, { single: false, skipWebUi: false })
  const platforms = rebrandPlatformPackages(distDir, brand, upstreamRoot)
  await smokeTest(path.join(hostPackage(platforms).dir, "bin", binaryName(brand)), version, brand)
  await signHook(distDir)

  console.log("\n== package ==")
  const out = path.join(DIST, version, "release")
  rmSync(out, { recursive: true, force: true })
  const metaDir = writeMetaPackage(distDir, brand, version, platforms, upstreamRoot)
  const toPublish: { name: string; version: string; tgz: string }[] = []
  for (const p of platforms) toPublish.push({ name: p.name, version: p.version, tgz: await packDir(p.dir, out) })
  toPublish.push({ name: brand.npmPackage, version, tgz: await packDir(metaDir, out) }) // meta last

  console.log("\n== publish ==")
  const failed: string[] = []
  const published: string[] = []
  for (const t of toPublish) {
    const exists = (await $`npm view ${t.name}@${t.version} version`.quiet().nothrow()).exitCode === 0
    if (exists) {
      console.log(`  already published ${t.name}@${t.version}`)
      published.push(t.name)
      continue
    }
    // No --access public / --tag: the internal registry decides visibility, and upstream's dist-tags do not apply here.
    const r = await $`npm publish ${t.tgz}`.nothrow()
    if (r.exitCode !== 0) failed.push(t.name)
    else {
      published.push(t.name)
      console.log(`  published ${t.name}@${t.version}`)
    }
  }

  console.log("\n== github release ==")
  const archived = await archiveBinaries(platforms, out)
  for (const name of archived.failed) console.log(`  warning: could not archive ${name}`)
  failed.push(...archived.failed)
  const archives = archived.files
  const tag = `v${version}`
  const view = await $`gh release view ${tag} --repo ${brand.releaseRepo}`.quiet().nothrow()
  const notes = `${brand.productName} ${brand.tagline}, rebranded from https://github.com/${brand.upstreamRepo}/releases/tag/${tag}`
  const gh =
    view.exitCode === 0
      ? await $`gh release upload ${tag} --repo ${brand.releaseRepo} --clobber ${archives}`.nothrow()
      : await $`gh release create ${tag} --repo ${brand.releaseRepo} --title ${`${brand.productName} ${tag}`} --notes ${notes} ${archives}`.nothrow()
  if (gh.exitCode !== 0) {
    console.log(`  warning: github release failed (exit ${gh.exitCode})`)
    failed.push("github-release")
  } else {
    console.log(`  ${view.exitCode === 0 ? "updated" : "created"} release ${tag} on ${brand.releaseRepo}`)
  }

  if (failed.length) {
    throw new PipelineError(
      `published: ${published.join(", ") || "nothing"}.\n  failed: ${failed.join(", ")}.\n  Rerun to complete the rest; publishing skips what is already on the registry.`,
      EXIT.publish,
    )
  }
  console.log(`\n${brand.productName} ${version} released.`)
}

/** macOS only: build upstream's Electron app from the rebranded checkout and install it to ~/Applications. */
export async function desktop(brand: Brand, version: string): Promise<void> {
  if (process.platform !== "darwin") throw new PipelineError("--desktop builds the macOS app and only runs on macOS for now", EXIT.input)
  const { upstreamRoot, env } = await checkout(brand, version)
  try {
    const app = await buildDesktop(upstreamRoot, brand, version, env)
    await verifyDesktop(app, brand)
    const installed = await installDesktop(app, brand)
    console.log(`\n${brand.productName} desktop ${version} installed: ${installed}\n  open it from Launchpad, Spotlight, or: open ${JSON.stringify(installed)}`)
  } catch (e) {
    if (e instanceof DesktopBuildError) throw new PipelineError(e.message, e.step === "verify" ? EXIT.smoke : EXIT.build)
    throw e
  }
}

/**
 * macOS only: build the desktop app for both Mac and both Windows processor types on this Mac and
 * write a hand-deployable bundle. Nothing is installed on this machine.
 */
export async function desktopPackage(brand: Brand, version: string): Promise<void> {
  if (process.platform !== "darwin") throw new PipelineError("--desktop-package cross-builds from macOS (it needs codesign and ditto)", EXIT.input)
  const { upstreamRoot, env } = await checkout(brand, version)
  try {
    const built = await buildDesktopTargets(upstreamRoot, brand, version, env, DESKTOP_TARGETS)
    console.log("\n== desktop: verify ==")
    for (const b of built) {
      if (b.target.platform === "darwin") await verifyDesktop(b.path, brand, b.target)
      else verifyWindowsDesktop(b.path, brand, b.target)
    }
    console.log("\n== desktop: bundle ==")
    const out = path.join(DIST, version, "desktop")
    for (const f of await writeDesktopBundle(built, out, brand, version, path.join(upstreamRoot, "LICENSE"))) console.log(`  ${path.relative(ROOT, f)}`)
    console.log(`\n${brand.productName} desktop ${version} packaged: ${out}\n  hand this folder to a machine and follow INSTALL.md`)
  } catch (e) {
    if (e instanceof DesktopBuildError) throw new PipelineError(e.message, e.step === "verify" ? EXIT.smoke : EXIT.build)
    throw e
  }
}

/**
 * Build every target and write a hand-deployable bundle of the terminal version: standalone binaries,
 * an installer per platform, a guide and checksums. No registry, Node or npm needed on the targets.
 */
export async function packageBundle(brand: Brand, version: string): Promise<void> {
  const { upstreamRoot, distDir } = await prepare(brand, version, { single: false, skipWebUi: false })
  const platforms = rebrandPlatformPackages(distDir, brand, upstreamRoot)
  await smokeTest(path.join(hostPackage(platforms).dir, "bin", binaryName(brand)), version, brand)
  await signHook(distDir)

  console.log("\n== bundle ==")
  const out = path.join(DIST, version, "package")
  const bundle = await writeBundle(platforms, out, brand, version, path.join(upstreamRoot, "LICENSE"))
  for (const f of bundle.files) console.log(`  ${path.relative(ROOT, f)}`)
  if (bundle.failed.length) throw new PipelineError(`could not archive: ${bundle.failed.join(", ")}`, EXIT.build)

  // Prove the installer on this machine, from the bundle exactly as it will be shipped.
  if (process.platform !== "win32") {
    console.log("\n== installer self-test (into a temporary folder) ==")
    const probe = path.join(out, ".selftest")
    const envVar = `${placeholders(brand).productSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_INSTALL_DIR`
    const r = await $`sh ${path.join(out, "install.sh")}`.env({ ...process.env, [envVar]: probe }).nothrow()
    const ok = r.exitCode === 0 && r.stdout.toString().includes(version)
    rmSync(probe, { recursive: true, force: true })
    if (!ok) throw new PipelineError(`install.sh self-test failed (exit ${r.exitCode})`, EXIT.smoke)
  }
  console.log(`\n${brand.productName} ${version} packaged: ${out}\n  hand this folder to a machine and follow INSTALL.md`)
}

/** The company-controlled configuration bundle. No build: it is independent of the app version, so it is dated. */
export async function teamPackage(brand: Brand): Promise<void> {
  const date = new Date().toISOString().slice(0, 10)
  const out = path.join(DIST, "team", date)
  console.log(`== team bundle ${date} ==`)
  for (const f of await writeTeamBundle(out, brand, date)) console.log(`  ${path.relative(ROOT, f)}`)
  console.log(`\n${brand.productName} team configuration ${date} packaged: ${out}\n  an administrator installs it with: sudo sh install-team.sh`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const brand = loadBrand()
  if (args.mode === "check") return check(brand)
  if (args.mode === "team-package") return teamPackage(brand)
  if (args.mode === "launcher") return void (await installLauncher(brand, args.version ?? (await installedVersion(brand))))
  const version = args.version ?? (await latestUpstreamVersion(brand))
  if (args.mode === "local") return local(brand, version, args.skipWebUi)
  if (args.mode === "desktop") return desktop(brand, version)
  if (args.mode === "desktop-package") return desktopPackage(brand, version)
  if (args.mode === "package") return packageBundle(brand, version)
  return release(brand, version)
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    if (e instanceof PipelineError) {
      console.error(`\nerror: ${e.message}`)
      process.exit(e.code)
    }
    console.error(e)
    process.exit(1)
  })
}

import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { bundleId, type Brand } from "./brand"

/**
 * Builds upstream's Electron desktop app from an already-rebranded checkout.
 *
 * This stage builds for the local Mac only: an unpacked .app, ad-hoc signed, never
 * notarized or published. Signed, notarized, multi-OS builds belong to CI (stage 3),
 * because they need an Apple Developer ID, a Windows certificate and one runner per OS.
 */

export class DesktopBuildError extends Error {
  constructor(
    public readonly step: string,
    message: string,
  ) {
    super(`desktop ${step}: ${message}`)
    this.name = "DesktopBuildError"
  }
}

export function electronBuilderArgs(platform: string = process.platform, arch: string = process.arch): string[] {
  if (platform !== "darwin") throw new DesktopBuildError("package", `--desktop is macOS only for now (this is ${platform})`)
  // --dir: just the .app, no dmg. notarize=false: upstream's config demands Apple credentials we do not have locally.
  return ["--mac", `--${arch}`, "--dir", "--publish", "never", "--config", "electron-builder.config.ts", "-c.mac.notarize=false"]
}

export function builtAppPath(desktopDir: string, brand: Brand, arch: string = process.arch): string {
  return path.join(desktopDir, "dist", arch === "arm64" ? "mac-arm64" : "mac", `${brand.productName}.app`)
}

export function desktopBuildEnv(base: Record<string, string | undefined>, version: string): Record<string, string | undefined> {
  return {
    ...base,
    OPENCODE_VERSION: version,
    OPENCODE_CHANNEL: "prod", // selects prod names, ids and icons in upstream's scripts
    NODE_OPTIONS: "--max-old-space-size=4096",
    CSC_IDENTITY_AUTO_DISCOVERY: "false", // never pick up a signing identity from the keychain by accident
  }
}

/** prepare (icons, version, node server bundle) -> electron-vite build -> electron-builder -> ad-hoc sign. */
export async function buildDesktop(
  upstreamRoot: string,
  brand: Brand,
  version: string,
  baseEnv: Record<string, string | undefined>,
): Promise<string> {
  const args = electronBuilderArgs()
  const dir = path.join(upstreamRoot, "packages/desktop")
  const env = desktopBuildEnv(baseEnv, version)
  const run = async (step: string, cmd: ReturnType<typeof $>) => {
    console.log(`\n== desktop: ${step} ==`)
    const r = await cmd.cwd(dir).env(env).nothrow()
    if (r.exitCode !== 0) throw new DesktopBuildError(step, `exit ${r.exitCode}`)
  }

  rmSync(path.join(dir, "dist"), { recursive: true, force: true })
  await run("prepare", $`bun ./scripts/prepare.ts`)
  await run("build", $`bun run build`)
  await run("package", $`bun x electron-builder ${args}`)

  const app = builtAppPath(dir, brand)
  if (!existsSync(app)) throw new DesktopBuildError("package", `expected ${app}, electron-builder did not produce it`)

  // Apple Silicon refuses to run code without a valid signature; with no identity, sign ad hoc.
  await run("sign (ad hoc)", $`codesign --force --deep --sign - ${app}`)
  await run("verify signature", $`codesign --verify --deep --strict ${app}`)
  return app
}

/** The built app must carry our name and id, ship our UI strings, and have the updater off. */
export async function verifyDesktop(app: string, brand: Brand): Promise<void> {
  const plist = path.join(app, "Contents", "Info.plist")
  const read = async (key: string) => (await $`/usr/libexec/PlistBuddy -c ${`Print :${key}`} ${plist}`.quiet().nothrow().text()).trim()
  const name = await read("CFBundleName")
  const id = await read("CFBundleIdentifier")
  if (name !== brand.productName) throw new DesktopBuildError("verify", `CFBundleName is ${JSON.stringify(name)}, expected ${brand.productName}`)
  const expectedId = `${bundleId(brand)}.desktop`
  if (id !== expectedId) throw new DesktopBuildError("verify", `CFBundleIdentifier is ${JSON.stringify(id)}, expected ${expectedId}`)

  // app.asar is an uncompressed archive, so the UI's strings are visible in its bytes
  const asar = path.join(app, "Contents", "Resources", "app.asar")
  if (!existsSync(asar)) throw new DesktopBuildError("verify", `missing ${asar}`)
  const bytes = readFileSync(asar)
  if (!bytes.includes(`${brand.productName} Desktop`)) throw new DesktopBuildError("verify", `app.asar does not contain "${brand.productName} Desktop"`)
  if (bytes.includes('"OpenCode Desktop"')) throw new DesktopBuildError("verify", 'app.asar still contains "OpenCode Desktop"')
  console.log(`desktop app verified: ${name} (${id}), branded UI strings present`)
}

/**
 * Replacing a running app bundle leaves a half-old, half-new process behind, so ask a running
 * copy to quit first. Matched by the executable's full path, never by app name: the product is
 * called XCode, and Apple's Xcode must not be touched.
 */
async function quitRunningCopy(app: string): Promise<void> {
  const exe = path.join(app, "Contents", "MacOS") + path.sep
  if ((await $`pgrep -f ${exe}`.quiet().nothrow()).exitCode !== 0) return
  console.log("  quitting the running copy before replacing it")
  await $`pkill -TERM -f ${exe}`.quiet().nothrow()
  for (let i = 0; i < 20; i++) {
    await Bun.sleep(250)
    if ((await $`pgrep -f ${exe}`.quiet().nothrow()).exitCode !== 0) return
  }
}

/** Copy to ~/Applications (no admin rights needed), replacing any previous copy. */
export async function installDesktop(app: string, brand: Brand): Promise<string> {
  const destDir = path.join(homedir(), "Applications")
  mkdirSync(destDir, { recursive: true })
  const dest = path.join(destDir, `${brand.productName}.app`)
  await quitRunningCopy(dest)
  rmSync(dest, { recursive: true, force: true })
  const r = await $`ditto ${app} ${dest}`.nothrow() // ditto keeps symlinks, resource forks and the signature intact
  if (r.exitCode !== 0) throw new DesktopBuildError("install", `ditto exit ${r.exitCode}`)
  return dest
}

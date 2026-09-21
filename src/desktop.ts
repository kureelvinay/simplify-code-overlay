import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { bundleId, placeholders, type Brand } from "./brand"

/**
 * Builds upstream's Electron desktop app from an already-rebranded checkout.
 *
 * Mac apps come out as an unpacked .app, ad-hoc signed, never notarized or published. Windows
 * comes out as upstream's NSIS installer, unsigned. Both Windows and the other Mac architecture
 * are cross-built on this Mac; real signing and notarization need an Apple Developer ID and a
 * Windows certificate, which this stage does not have.
 */

export interface DesktopTarget {
  platform: "darwin" | "win32"
  arch: "arm64" | "x64"
}

export const DESKTOP_TARGETS: DesktopTarget[] = [
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "win32", arch: "x64" },
  { platform: "win32", arch: "arm64" },
]

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
  const common = ["--publish", "never", "--config", "electron-builder.config.ts"]
  if (platform === "win32") return ["--win", `--${arch}`, ...common]
  if (platform !== "darwin") throw new DesktopBuildError("package", `the desktop app is built for macOS and Windows only (not ${platform})`)
  // --dir: just the .app, no dmg. notarize=false: upstream's config demands Apple credentials we do not have locally.
  return ["--mac", `--${arch}`, "--dir", ...common, "-c.mac.notarize=false"]
}

export function builtAppPath(desktopDir: string, brand: Brand, arch: string = process.arch): string {
  return path.join(desktopDir, "dist", arch === "arm64" ? "mac-arm64" : "mac", `${brand.productName}.app`)
}

/** Where electron-builder leaves the Windows installer, following the artifactName our transform sets. */
export function builtInstallerPath(desktopDir: string, brand: Brand, arch: string): string {
  return path.join(desktopDir, "dist", `${placeholders(brand).productSlug}-desktop-win-${arch}.exe`)
}

/** The processor a Windows program was built for, or undefined if the bytes are not a Windows program. */
export function peMachine(bytes: Uint8Array): "x64" | "arm64" | "x86" | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (b.length < 0x40 || b.toString("latin1", 0, 2) !== "MZ") return undefined
  const pe = b.readUInt32LE(0x3c)
  if (pe + 6 > b.length || b.toString("latin1", pe, pe + 4) !== "PE\u0000\u0000") return undefined
  const machine = b.readUInt16LE(pe + 4)
  return machine === 0x8664 ? "x64" : machine === 0xaa64 ? "arm64" : machine === 0x014c ? "x86" : undefined
}

export function desktopBuildEnv(
  base: Record<string, string | undefined>,
  version: string,
  target?: DesktopTarget,
): Record<string, string | undefined> {
  return {
    ...base,
    // read by the transformed electron.vite.config.ts: upstream otherwise bakes in the HOST's terminal module
    ...(target ? { OVERLAY_TARGET_PLATFORM: target.platform, OVERLAY_TARGET_ARCH: target.arch } : {}),
    OPENCODE_VERSION: version,
    OPENCODE_CHANNEL: "prod", // selects prod names, ids and icons in upstream's scripts
    NODE_OPTIONS: "--max-old-space-size=4096",
    CSC_IDENTITY_AUTO_DISCOVERY: "false", // never pick up a signing identity from the keychain by accident
  }
}

const hostTarget = (): DesktopTarget => ({ platform: "darwin", arch: process.arch === "arm64" ? "arm64" : "x64" })

/**
 * prepare (icons, version, node server bundle) once, then per target: electron-vite build ->
 * electron-builder -> (Mac) ad-hoc sign. Returns the .app for a Mac target, the installer .exe for Windows.
 */
export async function buildDesktopTargets(
  upstreamRoot: string,
  brand: Brand,
  version: string,
  baseEnv: Record<string, string | undefined>,
  targets: DesktopTarget[],
): Promise<{ target: DesktopTarget; path: string }[]> {
  const dir = path.join(upstreamRoot, "packages/desktop")
  const run = async (step: string, cmd: ReturnType<typeof $>, env: Record<string, string | undefined>) => {
    console.log(`\n== desktop: ${step} ==`)
    const r = await cmd.cwd(dir).env(env).nothrow()
    if (r.exitCode !== 0) throw new DesktopBuildError(step, `exit ${r.exitCode}`)
  }

  rmSync(path.join(dir, "dist"), { recursive: true, force: true })
  await run("prepare", $`bun ./scripts/prepare.ts`, desktopBuildEnv(baseEnv, version))

  const built: { target: DesktopTarget; path: string }[] = []
  for (const target of targets) {
    const label = `${target.platform}-${target.arch}`
    const env = desktopBuildEnv(baseEnv, version, target)
    // the build must be repeated per target: the terminal module's platform is baked into out/main
    await run(`build (${label})`, $`bun run build`, env)
    await run(`package (${label})`, $`bun x electron-builder ${electronBuilderArgs(target.platform, target.arch)}`, env)

    if (target.platform === "win32") {
      const exe = builtInstallerPath(dir, brand, target.arch)
      if (!existsSync(exe)) throw new DesktopBuildError("package", `expected ${exe}, electron-builder did not produce it`)
      built.push({ target, path: exe })
      continue
    }
    const app = builtAppPath(dir, brand, target.arch)
    if (!existsSync(app)) throw new DesktopBuildError("package", `expected ${app}, electron-builder did not produce it`)
    // Apple Silicon refuses to run code without a valid signature; with no identity, sign ad hoc.
    await run(`sign ad hoc (${label})`, $`codesign --force --deep --sign - ${app}`, env)
    await run(`verify signature (${label})`, $`codesign --verify --deep --strict ${app}`, env)
    built.push({ target, path: app })
  }
  return built
}

/** The app for this Mac only. */
export async function buildDesktop(upstreamRoot: string, brand: Brand, version: string, baseEnv: Record<string, string | undefined>): Promise<string> {
  if (process.platform !== "darwin") throw new DesktopBuildError("package", `--desktop runs on macOS only (this is ${process.platform})`)
  return (await buildDesktopTargets(upstreamRoot, brand, version, baseEnv, [hostTarget()]))[0].path
}

/** The built app must carry our name and id, ship our UI strings, and have the updater off. */
export async function verifyDesktop(app: string, brand: Brand, target: DesktopTarget = hostTarget()): Promise<void> {
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
  assertTerminalModule(bytes, target, (m) => {
    throw new DesktopBuildError("verify", m)
  })
  const exe = (await $`file -b ${path.join(app, "Contents", "MacOS", brand.productName)}`.quiet().nothrow().text()).trim()
  const wanted = target.arch === "arm64" ? "arm64" : "x86_64"
  if (!exe.includes(wanted)) throw new DesktopBuildError("verify", `the app is ${JSON.stringify(exe)}, expected a ${wanted} program`)
  console.log(`desktop app verified: ${name} (${id}), ${wanted}, branded UI strings present`)
}

/**
 * Replacing a running app bundle leaves a half-old, half-new process behind, so ask a running
 * copy to quit first. Matched by the executable's full path, never by app name: the product is
 * called Simplify Code, and Apple's Xcode must not be touched.
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

/** The app imports exactly one terminal module, chosen at build time. It must be the target's, not this Mac's. */
function assertTerminalModule(asar: Buffer, target: DesktopTarget, fail: (m: string) => void): void {
  const imported = [...new Set([...asar.toString("latin1").matchAll(/from\s*"@lydell\/node-pty-([a-z0-9]+-[a-z0-9]+)"/g)].map((m) => m[1]))]
  const expected = `${target.platform}-${target.arch}`
  if (imported.length !== 1 || imported[0] !== expected)
    fail(`the app loads the terminal module for [${imported.join(", ") || "nothing"}], expected ${expected}; a terminal would not open`)
}

/**
 * A Windows installer cannot be run here, so check what can be checked: the installer and the app
 * inside it are Windows programs for the right processor, the app carries our name and UI strings,
 * and the terminal module baked in is the Windows one for that processor, not this Mac's.
 */
export function verifyWindowsDesktop(installer: string, brand: Brand, target: DesktopTarget): void {
  const fail = (m: string) => {
    throw new DesktopBuildError("verify", `${path.basename(installer)}: ${m}`)
  }
  // the NSIS stub is a 32-bit program whatever it installs; the app inside is checked for the real processor
  if (peMachine(readFileSync(installer)) !== "x86") fail("is not an NSIS installer (expected a 32-bit Windows program)")

  const unpacked = path.join(path.dirname(installer), target.arch === "x64" ? "win-unpacked" : `win-${target.arch}-unpacked`)
  const exe = path.join(unpacked, `${brand.productName}.exe`)
  if (!existsSync(exe)) fail(`missing ${exe}`)
  const exeBytes = readFileSync(exe)
  if (peMachine(exeBytes) !== target.arch) fail(`${brand.productName}.exe is built for ${peMachine(exeBytes) ?? "an unknown processor"}, expected ${target.arch}`)
  // version resources are UTF-16: this is the name Windows shows in Task Manager and file properties
  if (!exeBytes.includes(Buffer.from(brand.productName, "utf16le"))) fail(`${brand.productName}.exe does not carry the product name in its version resources`)

  const asar = path.join(unpacked, "resources", "app.asar")
  if (!existsSync(asar)) fail(`missing ${asar}`)
  const bytes = readFileSync(asar)
  if (!bytes.includes(`${brand.productName} Desktop`)) fail(`app.asar does not contain "${brand.productName} Desktop"`)
  if (bytes.includes('"OpenCode Desktop"')) fail('app.asar still contains "OpenCode Desktop"')
  assertTerminalModule(bytes, target, fail)
  const native = path.join(unpacked, "resources", "app.asar.unpacked", "node_modules", "@lydell", `node-pty-win32-${target.arch}`)
  if (!existsSync(native)) fail(`missing ${native}`)
  console.log(`desktop installer verified: ${path.basename(installer)} (Windows ${target.arch}, branded, Windows terminal module)`)
}

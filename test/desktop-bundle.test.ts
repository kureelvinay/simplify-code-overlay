import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { loadBrand } from "../src/brand"
import { desktopArtifactName, desktopInstallGuide, installMacSh, installWindowsPs1, makeMacZip } from "../src/desktop-bundle"

const brand = loadBrand()

describe("desktopArtifactName", () => {
  test("names say which machine each installer is for, in words a developer would use", () => {
    expect(desktopArtifactName(brand, { platform: "darwin", arch: "arm64" })).toBe("XCode-mac-apple-silicon.zip")
    expect(desktopArtifactName(brand, { platform: "darwin", arch: "x64" })).toBe("XCode-mac-intel.zip")
    expect(desktopArtifactName(brand, { platform: "win32", arch: "x64" })).toBe("XCode-windows-x64-setup.exe")
    expect(desktopArtifactName(brand, { platform: "win32", arch: "arm64" })).toBe("XCode-windows-arm64-setup.exe")
  })
})

describe("installMacSh", () => {
  const script = installMacSh(brand, "1.18.31")

  test("is valid sh", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "xcode-dsh-"))
    writeFileSync(path.join(dir, "i.sh"), script)
    expect((await $`sh -n ${path.join(dir, "i.sh")}`.quiet().nothrow()).exitCode).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })

  test("clears the quarantine mark, because the app is not signed by Apple", () => {
    expect(script).toContain("xattr -dr com.apple.quarantine")
  })

  test("quits a running copy by its exact path, never by name: Apple's Xcode must not be touched", () => {
    expect(script).toContain('pkill -TERM -f "$DEST/Contents/MacOS/"')
    expect(script).not.toMatch(/pkill[^\n]*\bXCode\b(?!\.app)/)
    expect(script).not.toContain("killall")
  })

  test("mounts nothing: some Macs cannot unmount a fresh volume, and a zip needs no volume at all", () => {
    expect(script).not.toContain("hdiutil")
    expect(script).toContain("ditto -x -k")
  })

  test.skipIf(process.platform !== "darwin")("installs from the real archive, and the code signature survives the trip", async () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "xcode-zip-")))
    const app = path.join(dir, "src", "XCode.app")
    mkdirSync(path.join(app, "Contents", "MacOS"), { recursive: true })
    await $`cp /bin/ls ${path.join(app, "Contents", "MacOS", "XCode")}`.quiet()
    writeFileSync(
      path.join(app, "Contents", "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>XCode</string><key>CFBundleIdentifier</key><string>test.xcode</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`,
    )
    expect((await $`codesign --force --deep --sign - ${app}`.quiet().nothrow()).exitCode).toBe(0)

    const arch = process.arch === "arm64" ? "arm64" : "x64"
    const bundle = path.join(dir, "bundle")
    mkdirSync(bundle)
    const zip = path.join(bundle, desktopArtifactName(brand, { platform: "darwin", arch }))
    await makeMacZip(app, zip)
    await $`xattr -w com.apple.quarantine "0083;66ee0000;Safari;" ${zip}`.quiet() // as if downloaded
    writeFileSync(path.join(bundle, "install-mac.sh"), script)

    const dest = path.join(dir, "Apps")
    const r = await $`sh ${path.join(bundle, "install-mac.sh")}`.env({ ...process.env, XCODE_DESKTOP_INSTALL_DIR: dest }).quiet().nothrow()
    expect(r.exitCode).toBe(0)
    const installed = path.join(dest, "XCode.app")
    expect(existsSync(path.join(installed, "Contents", "MacOS", "XCode"))).toBe(true)
    expect((await $`codesign --verify --deep --strict ${installed}`.quiet().nothrow()).exitCode).toBe(0)
    expect((await $`xattr -r ${installed}`.quiet().nothrow().text()).includes("com.apple.quarantine")).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)
})

describe("installWindowsPs1", () => {
  const script = installWindowsPs1(brand, "1.18.31")

  test("uses Windows line endings", () => {
    expect(script).toContain("\r\n")
    expect(script.replaceAll("\r\n", "")).not.toContain("\n")
  })
  test("picks the installer by processor, unblocks it and waits for it", () => {
    expect(script).toContain("XCode-windows-arm64-setup.exe")
    expect(script).toContain("XCode-windows-x64-setup.exe")
    expect(script).toContain("Unblock-File")
    expect(script).toContain("-Wait")
  })
})

describe("desktopInstallGuide", () => {
  const guide = desktopInstallGuide(brand, "1.18.31", ["XCode-mac-apple-silicon.zip", "XCode-windows-x64-setup.exe"])

  test("says plainly what is not signed and what was never run", () => {
    expect(guide).toContain("not signed")
    expect(guide).toContain("has not been run on Windows")
    expect(guide).toContain("SmartScreen")
  })
  test("lists only the installers that were actually built", () => {
    expect(guide).toContain("XCode-mac-apple-silicon.zip")
    expect(guide).not.toContain("XCode-mac-intel.zip")
  })
  test("warns that the app does not update itself", () => {
    expect(guide).toContain("does not update itself")
  })
})

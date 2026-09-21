import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { loadBrand } from "../src/brand"
import { appName, buildMacApp, bundleId, infoPlist, launcherScript, runScript } from "../src/launcher"

const brand = loadBrand()
const ICON = path.join(import.meta.dir, "../brand/icon.png")
const onMac = process.platform === "darwin"

let tmp: string
beforeEach(() => {
  tmp = realpathSync(mkdtempSync(path.join(tmpdir(), "xcode-launcher-")))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe("naming", () => {
  test("is named as the terminal companion, leaving the product name to the desktop app", () => {
    expect(appName(brand)).toBe("XCode Terminal.app")
  })
  test("bundle id is derived from the npm package and does not collide with the desktop app", () => {
    expect(bundleId(brand)).toBe("com.simplifyx.xcode.terminal")
  })
})

describe("infoPlist", () => {
  const plist = infoPlist(brand, "1.18.31")
  test("declares an application bundle with our executable, icon and version", () => {
    expect(plist).toContain("<key>CFBundleName</key>\n  <string>XCode Terminal</string>")
    expect(plist).toContain("<key>CFBundleIdentifier</key>\n  <string>com.simplifyx.xcode.terminal</string>")
    expect(plist).toContain("<key>CFBundleExecutable</key>\n  <string>XCode Terminal</string>")
    expect(plist).toContain("<key>CFBundleIconFile</key>\n  <string>AppIcon</string>")
    expect(plist).toContain("<key>CFBundleShortVersionString</key>\n  <string>1.18.31</string>")
    expect(plist).toContain("<key>CFBundlePackageType</key>\n  <string>APPL</string>")
  })
})

describe("launcherScript", () => {
  const script = launcherScript()
  test("opens the bundled run.command in Terminal without AppleScript automation", () => {
    expect(script.startsWith("#!/bin/sh\n")).toBe(true)
    expect(script).toContain("open -a Terminal")
    expect(script).toContain("Resources/run.command")
    expect(script).not.toContain("tell application")
  })
})

describe("runScript", () => {
  function fakeBin(name: string, body: string) {
    const dir = path.join(tmp, "bin")
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, name)
    writeFileSync(file, `#!/bin/sh\n${body}\n`)
    chmodSync(file, 0o755)
    return dir
  }
  function writeRun() {
    const file = path.join(tmp, "run.command")
    writeFileSync(file, runScript(brand))
    chmodSync(file, 0o755)
    return file
  }

  test.skipIf(!onMac)("is valid zsh", async () => {
    const r = await $`zsh -n ${writeRun()}`.nothrow().quiet()
    expect(r.exitCode).toBe(0)
  })

  test.skipIf(!onMac)("runs opencode inside the chosen project folder", async () => {
    const project = path.join(tmp, "my project")
    mkdirSync(project)
    const bin = fakeBin("opencode", 'echo "ran-in:$(pwd)"')
    const r = await $`${writeRun()} < /dev/null`
      .env({ PATH: `${bin}:/usr/bin:/bin`, HOME: tmp, XCODE_PROJECT_DIR: project })
      .nothrow()
      .quiet()
    expect(r.stdout.toString()).toContain(`ran-in:${project}`)
    expect(r.exitCode).toBe(0)
  })

  test.skipIf(!onMac)("explains how to install when opencode is missing", async () => {
    const r = await $`${writeRun()} < /dev/null`
      .env({ PATH: "/usr/bin:/bin", HOME: tmp, XCODE_PROJECT_DIR: tmp })
      .nothrow()
      .quiet()
    expect(r.exitCode).toBe(1)
    expect(r.stdout.toString()).toContain("npm install -g @simplifyx/xcode")
  })

  test.skipIf(!onMac)("exits quietly when the folder chooser is cancelled", async () => {
    const bin = fakeBin("opencode", 'echo "should-not-run"')
    fakeBin("osascript", "exit 1") // what `choose folder` does on Cancel
    const r = await $`${writeRun()} < /dev/null`.env({ PATH: `${bin}:/usr/bin:/bin`, HOME: tmp }).nothrow().quiet()
    expect(r.stdout.toString()).not.toContain("should-not-run")
    expect(r.exitCode).toBe(0)
  })
})

describe("buildMacApp", () => {
  test("writes a complete, executable bundle and can be rebuilt in place", async () => {
    const app = await buildMacApp(tmp, brand, "1.18.31", ICON)
    expect(app).toBe(path.join(tmp, "XCode Terminal.app"))
    for (const f of ["Contents/Info.plist", "Contents/MacOS/XCode Terminal", "Contents/Resources/run.command"]) {
      expect(existsSync(path.join(app, f))).toBe(true)
    }
    expect(statSync(path.join(app, "Contents/MacOS/XCode Terminal")).mode & 0o111).not.toBe(0)
    expect(statSync(path.join(app, "Contents/Resources/run.command")).mode & 0o111).not.toBe(0)
    expect(readFileSync(path.join(app, "Contents/Info.plist"), "utf8")).toBe(infoPlist(brand, "1.18.31"))
    await buildMacApp(tmp, brand, "1.18.32", ICON)
    expect(readFileSync(path.join(app, "Contents/Info.plist"), "utf8")).toContain("1.18.32")
  })

  test.skipIf(!onMac)("produces a lint-clean plist and a real .icns on macOS", async () => {
    const app = await buildMacApp(tmp, brand, "1.18.31", ICON)
    expect((await $`plutil -lint ${path.join(app, "Contents/Info.plist")}`.nothrow().quiet()).exitCode).toBe(0)
    const icns = readFileSync(path.join(app, "Contents/Resources/AppIcon.icns"))
    expect(icns.subarray(0, 4).toString("latin1")).toBe("icns")
  })
})

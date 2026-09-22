import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadBrand } from "../src/brand"
import { builtAppPath, builtInstallerPath, DESKTOP_TARGETS, desktopBuildEnv, electronBuilderArgs, peMachine } from "../src/desktop"

const brand = loadBrand()

describe("electronBuilderArgs", () => {
  test("builds an unpacked, unpublished, un-notarized mac app for the host architecture", () => {
    const args = electronBuilderArgs("darwin", "arm64")
    expect(args).toEqual(["--mac", "--arm64", "--dir", "--publish", "never", "--config", "electron-builder.config.ts", "-c.mac.notarize=false"])
  })
  test("maps x64", () => {
    expect(electronBuilderArgs("darwin", "x64")).toContain("--x64")
  })
  test("builds the Windows installer directly, unpublished, for the requested architecture", () => {
    expect(electronBuilderArgs("win32", "x64")).toEqual(["--win", "--x64", "--publish", "never", "--config", "electron-builder.config.ts"])
    expect(electronBuilderArgs("win32", "arm64")).toContain("--arm64")
  })
  test("refuses platforms this stage does not build", () => {
    expect(() => electronBuilderArgs("linux", "x64")).toThrow("macOS and Windows only")
  })
})

describe("builtAppPath", () => {
  test("follows electron-builder's output layout", () => {
    expect(builtAppPath("/u/packages/desktop", brand, "arm64")).toBe("/u/packages/desktop/dist/mac-arm64/Simplify Code.app")
    expect(builtAppPath("/u/packages/desktop", brand, "x64")).toBe("/u/packages/desktop/dist/mac/Simplify Code.app")
  })
})

describe("desktopBuildEnv", () => {
  test("pins the prod channel and version, and disables certificate discovery", () => {
    const env = desktopBuildEnv({ PATH: "/bin", HOME: "/h" }, "1.18.31")
    expect(env.OPENCODE_CHANNEL).toBe("prod")
    expect(env.OPENCODE_VERSION).toBe("1.18.31")
    expect(env.CSC_IDENTITY_AUTO_DISCOVERY).toBe("false")
    expect(env.PATH).toBe("/bin")
  })
})

describe("cross-building", () => {
  test("covers both Mac and both Windows processor types", () => {
    expect(DESKTOP_TARGETS.map((t) => `${t.platform}-${t.arch}`)).toEqual(["darwin-arm64", "darwin-x64", "win32-x64", "win32-arm64"])
  })
  test("tells upstream's build which machine it is building for, because upstream assumes the host", () => {
    const env = desktopBuildEnv({ PATH: "/bin" }, "1.18.31", { platform: "win32", arch: "x64" })
    expect(env.OVERLAY_TARGET_PLATFORM).toBe("win32")
    expect(env.OVERLAY_TARGET_ARCH).toBe("x64")
  })
  test("leaves the target unset for a plain host build", () => {
    expect(desktopBuildEnv({}, "1.18.31").OVERLAY_TARGET_PLATFORM).toBeUndefined()
  })
  test("finds the Windows installer where electron-builder's artifactName puts it", () => {
    expect(builtInstallerPath("/u/packages/desktop", brand, "x64")).toBe("/u/packages/desktop/dist/simplify-code-desktop-win-x64.exe")
    expect(builtInstallerPath("/u/packages/desktop", brand, "arm64")).toBe("/u/packages/desktop/dist/simplify-code-desktop-win-arm64.exe")
  })
})

describe("peMachine", () => {
  const pe = (machine: number) => {
    const b = Buffer.alloc(256)
    b.write("MZ", 0, "latin1")
    b.writeUInt32LE(128, 0x3c)
    b.write("PE\0\0", 128, "latin1")
    b.writeUInt16LE(machine, 132)
    return b
  }
  test("reads the processor type a Windows program was built for", () => {
    expect(peMachine(pe(0x8664))).toBe("x64")
    expect(peMachine(pe(0xaa64))).toBe("arm64")
  })
  test("recognises 32-bit programs: an NSIS installer is one whatever it installs, so it runs on every Windows", () => {
    expect(peMachine(pe(0x014c))).toBe("x86")
  })
  test("rejects anything that is not a Windows program", () => {
    expect(peMachine(Buffer.from("#!/bin/sh\necho hi\n"))).toBeUndefined()
    expect(peMachine(Buffer.alloc(0))).toBeUndefined()
  })
})

describe("the company set inside the desktop app", () => {
  test("is verified in the built app: the enforced config and the team folder must be in resources/company", async () => {
    const { verifyCompanySet } = await import("../src/desktop")
    const resources = mkdtempSync(path.join(tmpdir(), "resources-"))
    expect(() => verifyCompanySet(resources, brand)).toThrow("resources/company")
    mkdirSync(path.join(resources, "company", "team", "skills", "impeccable"), { recursive: true })
    writeFileSync(path.join(resources, "company", "simplify-code.jsonc"), "{}")
    expect(() => verifyCompanySet(resources, brand)).toThrow("SKILL.md")
    writeFileSync(path.join(resources, "company", "team", "skills", "impeccable", "SKILL.md"), "---\nname: impeccable\n---\n")
    mkdirSync(path.join(resources, "company", "team", "plugins"), { recursive: true })
    writeFileSync(path.join(resources, "company", "team", "plugins", "ciso-session.js"), "")
    expect(() => verifyCompanySet(resources, brand)).not.toThrow()
    rmSync(resources, { recursive: true, force: true })
  })
})

import { describe, expect, test } from "bun:test"
import { loadBrand } from "../src/brand"
import { builtAppPath, desktopBuildEnv, electronBuilderArgs } from "../src/desktop"

const brand = loadBrand()

describe("electronBuilderArgs", () => {
  test("builds an unpacked, unpublished, un-notarized mac app for the host architecture", () => {
    const args = electronBuilderArgs("darwin", "arm64")
    expect(args).toEqual(["--mac", "--arm64", "--dir", "--publish", "never", "--config", "electron-builder.config.ts", "-c.mac.notarize=false"])
  })
  test("maps x64", () => {
    expect(electronBuilderArgs("darwin", "x64")).toContain("--x64")
  })
  test("refuses platforms this stage does not build", () => {
    expect(() => electronBuilderArgs("linux", "x64")).toThrow("macOS only")
  })
})

describe("builtAppPath", () => {
  test("follows electron-builder's output layout", () => {
    expect(builtAppPath("/u/packages/desktop", brand, "arm64")).toBe("/u/packages/desktop/dist/mac-arm64/XCode.app")
    expect(builtAppPath("/u/packages/desktop", brand, "x64")).toBe("/u/packages/desktop/dist/mac/XCode.app")
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

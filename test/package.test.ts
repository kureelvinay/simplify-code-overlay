import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { loadBrand } from "../src/brand"
import { TransformError } from "../src/rebrand"
import {
  hostPackage,
  metaPackageJson,
  packDir,
  placeholderBin,
  rebrandPlatformPackages,
  rebrandPostinstall,
  scopedName,
  writeMetaPackage,
  type PlatformPackage,
} from "../src/package"

const FIXTURES = path.join(import.meta.dir, "fixtures/upstream")
const brand = loadBrand()

let upstreamRoot: string
let dist: string

function fakePlatform(name: string) {
  const dir = path.join(dist, name)
  mkdirSync(path.join(dir, "bin"), { recursive: true })
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.18.31", preferUnplugged: true, os: ["darwin"], cpu: ["arm64"] }, null, 2))
  writeFileSync(path.join(dir, "bin/opencode"), "#!/bin/sh\necho 1.18.31\n")
}

beforeEach(() => {
  upstreamRoot = mkdtempSync(path.join(tmpdir(), "simplify-code-upstream-"))
  mkdirSync(path.join(upstreamRoot, "packages/opencode/script"), { recursive: true })
  writeFileSync(path.join(upstreamRoot, "LICENSE"), "MIT License\n\nCopyright (c) upstream\n")
  copyFileSync(path.join(FIXTURES, "packages/opencode/script/postinstall.mjs"), path.join(upstreamRoot, "packages/opencode/script/postinstall.mjs"))
  dist = path.join(upstreamRoot, "packages/opencode/dist")
  fakePlatform("opencode-darwin-arm64")
  fakePlatform("opencode-linux-x64-baseline-musl")
})

afterEach(() => rmSync(upstreamRoot, { recursive: true, force: true }))

describe("scopedName", () => {
  test("keeps the platform suffix", () => {
    expect(scopedName("opencode-darwin-arm64", brand)).toBe("@simplifyx/simplify-code-darwin-arm64")
    expect(scopedName("opencode-linux-x64-baseline-musl", brand)).toBe("@simplifyx/simplify-code-linux-x64-baseline-musl")
  })
  test("rejects unexpected names", () => {
    expect(() => scopedName("something-else", brand)).toThrow("unexpected platform package name")
  })
})

describe("rebrandPlatformPackages", () => {
  test("renames, adds LICENSE, and is idempotent", () => {
    const first = rebrandPlatformPackages(dist, brand, upstreamRoot)
    expect(first.map((p) => p.name).sort()).toEqual(["@simplifyx/simplify-code-darwin-arm64", "@simplifyx/simplify-code-linux-x64-baseline-musl"])
    expect(first.every((p) => p.version === "1.18.31")).toBe(true)
    const pkg = JSON.parse(readFileSync(path.join(dist, "opencode-darwin-arm64/package.json"), "utf8"))
    expect(pkg.name).toBe("@simplifyx/simplify-code-darwin-arm64")
    expect(pkg.os).toEqual(["darwin"])
    expect(existsSync(path.join(dist, "opencode-darwin-arm64/LICENSE"))).toBe(true)
    const second = rebrandPlatformPackages(dist, brand, upstreamRoot)
    expect(second.map((p) => p.name).sort()).toEqual(first.map((p) => p.name).sort())
  })
})

describe("metaPackageJson", () => {
  const platforms: PlatformPackage[] = [
    { dir: "x", name: "@simplifyx/simplify-code-darwin-arm64", version: "1.18.31" },
    { dir: "y", name: "@simplifyx/simplify-code-linux-x64", version: "1.18.31" },
  ]
  test("mirrors upstream's meta package shape with scoped names", () => {
    const json = metaPackageJson(brand, "1.18.31", platforms) as any
    expect(json.name).toBe("@simplifyx/simplify-code")
    expect(json.version).toBe("1.18.31")
    expect(json.bin).toEqual({ opencode: "./bin/opencode.exe" })
    expect(json.scripts).toEqual({ postinstall: "node ./postinstall.mjs" })
    expect(json.license).toBe("MIT")
    expect(json.description).toBe("Simplify Code by SimplifyX")
    expect(json.optionalDependencies).toEqual({
      "@simplifyx/simplify-code-darwin-arm64": "1.18.31",
      "@simplifyx/simplify-code-linux-x64": "1.18.31",
    })
  })
  test("accepts file: overrides for local installs", () => {
    const json = metaPackageJson(brand, "1.18.31", platforms, { "@simplifyx/simplify-code-darwin-arm64": "file:/tmp/x.tgz" }) as any
    expect(json.optionalDependencies["@simplifyx/simplify-code-darwin-arm64"]).toBe("file:/tmp/x.tgz")
    expect(json.optionalDependencies["@simplifyx/simplify-code-linux-x64"]).toBe("1.18.31")
  })
})

describe("rebrandPostinstall", () => {
  test("repoints the platform package prefix", () => {
    const source = readFileSync(path.join(FIXTURES, "packages/opencode/script/postinstall.mjs"), "utf8")
    const out = rebrandPostinstall(source, brand)
    expect(out).toContain("const base = `@simplifyx/simplify-code-${platform}-${arch}`")
    expect(out).not.toContain("const base = `opencode-${platform}-${arch}`")
    // the binary file names inside the platform packages are unchanged
    expect(out).toContain('const sourceBinary = platform === "windows" ? "opencode.exe" : "opencode"')
  })
  test("fails loudly on drift", () => {
    expect(() => rebrandPostinstall("nothing here", brand)).toThrow(TransformError)
  })
})

describe("placeholderBin", () => {
  test("names our package and exits 1", () => {
    const script = placeholderBin(brand)
    expect(script.startsWith("#!/bin/sh\n")).toBe(true)
    expect(script).toContain("@simplifyx/simplify-code")
    expect(script.trim().endsWith("exit 1")).toBe(true)
  })
})

describe("writeMetaPackage", () => {
  test("writes a complete, packable meta package", async () => {
    const platforms = rebrandPlatformPackages(dist, brand, upstreamRoot)
    const metaDir = writeMetaPackage(dist, brand, "1.18.31", platforms, upstreamRoot)
    expect(path.basename(metaDir)).toBe("meta")
    for (const f of ["package.json", "postinstall.mjs", "LICENSE", "bin/opencode.exe"]) {
      expect(existsSync(path.join(metaDir, f))).toBe(true)
    }
    expect(statSync(path.join(metaDir, "bin/opencode.exe")).mode & 0o111).not.toBe(0)
    const json = JSON.parse(readFileSync(path.join(metaDir, "package.json"), "utf8"))
    expect(Object.keys(json.optionalDependencies)).toHaveLength(2)

    const out = mkdtempSync(path.join(tmpdir(), "simplify-code-pack-"))
    const tgz = await packDir(metaDir, out)
    expect(tgz.endsWith(".tgz")).toBe(true)
    expect(path.basename(tgz)).toBe("simplifyx-simplify-code-1.18.31.tgz")
    // upstream's MIT LICENSE must survive npm pack, or we ship without attribution
    const entries = await $`tar -tzf ${tgz}`.text()
    expect(entries.split("\n")).toContain("package/LICENSE")
    rmSync(out, { recursive: true, force: true })
  })
})

describe("hostPackage", () => {
  test("prefers the plain package for this machine", () => {
    const os = process.platform === "win32" ? "windows" : process.platform
    const arch = process.arch
    const platforms: PlatformPackage[] = [
      { dir: "a", name: `@simplifyx/simplify-code-${os}-${arch}-baseline`, version: "1" },
      { dir: "b", name: `@simplifyx/simplify-code-${os}-${arch}`, version: "1" },
      { dir: "c", name: "@simplifyx/simplify-code-linux-arm64-musl", version: "1" },
    ]
    expect(hostPackage(platforms).dir).toBe("b")
  })
  test("throws when this machine has no package", () => {
    expect(() => hostPackage([{ dir: "c", name: "@simplifyx/simplify-code-nowhere-x", version: "1" }])).toThrow("no platform package for")
  })
})

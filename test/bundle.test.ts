import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { loadBrand } from "../src/brand"
import { archiveName, installGuide, installPs1, installSh, sha256Sums, writeBundle } from "../src/bundle"
import type { PlatformPackage } from "../src/package"

const brand = loadBrand()
const onMac = process.platform === "darwin"
let tmp: string
beforeEach(() => void (tmp = realpathSync(mkdtempSync(path.join(tmpdir(), "simplify-code-bundle-")))))
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

/** A platform folder shaped like upstream's dist output, with a stand-in binary that prints a version. */
function fakePlatform(name: string, binary: string, body = "#!/bin/sh\necho 9.9.9\n"): PlatformPackage {
  const dir = path.join(tmp, "dist", name.split("/").pop()!)
  mkdirSync(path.join(dir, "bin"), { recursive: true })
  writeFileSync(path.join(dir, "bin", binary), body)
  chmodSync(path.join(dir, "bin", binary), 0o755)
  return { dir, name, version: "9.9.9" }
}

describe("archiveName", () => {
  test("zip for macOS and Windows, tar.gz for Linux, named after the package's last segment", () => {
    expect(archiveName("@simplifyx/simplify-code-darwin-arm64")).toBe("simplify-code-darwin-arm64.zip")
    expect(archiveName("@simplifyx/simplify-code-windows-x64-baseline")).toBe("simplify-code-windows-x64-baseline.zip")
    expect(archiveName("@simplifyx/simplify-code-linux-x64-baseline-musl")).toBe("simplify-code-linux-x64-baseline-musl.tar.gz")
  })
})

describe("installSh", () => {
  const sh = installSh(brand, "1.18.31")
  test("picks the archive the same way upstream's own installer does", () => {
    expect(sh.startsWith("#!/bin/sh\n")).toBe(true)
    expect(sh).toContain('name="simplify-code-$os-$arch$suffix"')
    expect(sh).toContain("hw.optional.avx2_0") // Intel Macs without AVX2 need the baseline build
    expect(sh).toContain('suffix="$suffix-musl"') // baseline comes before musl in upstream's names
  })
  test("clears the macOS quarantine flag, without which Gatekeeper blocks an unsigned binary", () => {
    expect(sh).toContain("xattr -d com.apple.quarantine")
  })
  test.skipIf(!onMac)("really installs from a bundle folder and the installed command runs", async () => {
    const bundle = path.join(tmp, "bundle")
    const arch = process.arch === "arm64" ? "arm64" : "x64"
    await writeBundle([fakePlatform(`@simplifyx/simplify-code-darwin-${arch}`, "simplify-code"), fakePlatform(`@simplifyx/simplify-code-darwin-${arch}-baseline`, "opencode")], bundle, brand, "9.9.9")
    const dest = path.join(tmp, "installed")
    const r = await $`sh ${path.join(bundle, "install.sh")}`.env({ ...process.env, SIMPLIFY_CODE_INSTALL_DIR: dest }).nothrow().quiet()
    expect(r.exitCode).toBe(0)
    expect(r.stdout.toString()).toContain("9.9.9")
    expect(existsSync(path.join(dest, "simplify-code"))).toBe(true)
    expect((await $`${path.join(dest, "simplify-code")} --version`.quiet().text()).trim()).toBe("9.9.9")
  })
  test.skipIf(!onMac)("fails clearly when the archive for this machine is not in the bundle", async () => {
    const bundle = path.join(tmp, "bundle")
    await writeBundle([fakePlatform("@simplifyx/simplify-code-windows-x64", "simplify-code.exe")], bundle, brand, "9.9.9")
    const r = await $`sh ${path.join(bundle, "install.sh")}`.env({ ...process.env, SIMPLIFY_CODE_INSTALL_DIR: path.join(tmp, "x") }).nothrow().quiet()
    expect(r.exitCode).not.toBe(0)
    expect(r.stderr.toString()).toContain("not in this bundle")
  })
})

describe("installPs1", () => {
  const ps = installPs1(brand, "1.18.31")
  test("chooses x64, arm64 or the baseline build, installs per-user, and fixes PATH", () => {
    expect(ps).toContain('$env:PROCESSOR_ARCHITECTURE -eq "ARM64"')
    expect(ps).toContain("IsProcessorFeaturePresent(40)") // AVX2, the same probe upstream's npm wrapper uses
    expect(ps).toContain('"simplify-code-windows-$arch$suffix.zip"')
    expect(ps).toContain('Join-Path $env:LOCALAPPDATA "Programs\\Simplify Code"') // no administrator rights needed
    expect(ps).toContain('[Environment]::SetEnvironmentVariable("Path"')
  })
  test("removes the downloaded-file mark, without which SmartScreen blocks an unsigned exe", () => {
    expect(ps).toContain("Unblock-File")
  })
  test("uses CRLF line endings, which Windows PowerShell 5 handles most reliably", () => {
    expect(ps.includes("\r\n")).toBe(true)
    expect(ps.replaceAll("\r\n", "").includes("\n")).toBe(false)
  })
})

describe("writeBundle", () => {
  test("writes one archive per platform, both installers, a guide and checksums that match", async () => {
    const out = path.join(tmp, "bundle")
    const result = await writeBundle(
      [fakePlatform("@simplifyx/simplify-code-darwin-arm64", "simplify-code"), fakePlatform("@simplifyx/simplify-code-windows-x64", "simplify-code.exe"), fakePlatform("@simplifyx/simplify-code-linux-x64", "opencode")],
      out,
      brand,
      "9.9.9",
    )
    expect(result.failed).toEqual([])
    for (const f of ["simplify-code-darwin-arm64.zip", "simplify-code-windows-x64.zip", "simplify-code-linux-x64.tar.gz", "install.sh", "install.ps1", "INSTALL.md", "SHA256SUMS", "LICENSE"]) {
      expect({ f, exists: existsSync(path.join(out, f)) }).toEqual({ f, exists: true })
    }
    const sums = readFileSync(path.join(out, "SHA256SUMS"), "utf8")
    expect(sums).toBe(sha256Sums(out, ["simplify-code-darwin-arm64.zip", "simplify-code-linux-x64.tar.gz", "simplify-code-windows-x64.zip"]))
    expect(sums.split("\n").filter(Boolean)).toHaveLength(3)
    // the Windows archive holds simplify-code.exe at its root, which is what install.ps1 expects
    expect((await $`unzip -l ${path.join(out, "simplify-code-windows-x64.zip")}`.quiet().text())).toContain("simplify-code.exe")
  })
})

describe("installGuide", () => {
  test("says plainly what is and is not signed, and how to check a download", () => {
    const md = installGuide(brand, "1.18.31", ["simplify-code-darwin-arm64.zip", "simplify-code-windows-x64.zip"])
    expect(md).toContain("Simplify Code by SimplifyX 1.18.31")
    expect(md).toContain("not code-signed")
    expect(md).toContain("SHA256SUMS")
    expect(md).toContain("simplify-code --version")
    expect(md.toLowerCase()).not.toMatch(/\bopencode\b/)
  })
})

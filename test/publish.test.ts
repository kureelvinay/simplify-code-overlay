import { describe, expect, test } from "bun:test"
import { loadBrand } from "../src/brand"
import { contentType, missingAssets, releaseNotes, releaseTitle } from "../src/publish"

const brand = loadBrand()

describe("missingAssets", () => {
  const local = [
    { name: "xcode-darwin-arm64.zip", size: 100 },
    { name: "install.sh", size: 10 },
    { name: "SHA256SUMS", size: 5 },
  ]
  test("uploads everything to a new release", () => {
    expect(missingAssets(local, [])).toEqual({ upload: local, replace: [] })
  })
  test("skips what is already there with the same size, so an interrupted upload resumes", () => {
    const remote = [{ id: 1, name: "xcode-darwin-arm64.zip", size: 100, state: "uploaded" }]
    expect(missingAssets(local, remote).upload.map((a) => a.name)).toEqual(["install.sh", "SHA256SUMS"])
  })
  test("replaces a partial or stale asset instead of trusting it", () => {
    const remote = [
      { id: 7, name: "xcode-darwin-arm64.zip", size: 40, state: "uploaded" }, // wrong size: an older build
      { id: 8, name: "install.sh", size: 10, state: "starter" }, // GitHub's state for an upload that never finished
    ]
    const plan = missingAssets(local, remote)
    expect(plan.replace.map((a) => a.id)).toEqual([7, 8])
    expect(plan.upload.map((a) => a.name)).toEqual(["xcode-darwin-arm64.zip", "install.sh", "SHA256SUMS"])
  })
})

describe("contentType", () => {
  test("names the archive formats and treats scripts and docs as text", () => {
    expect(contentType("a.zip")).toBe("application/zip")
    expect(contentType("a.tar.gz")).toBe("application/gzip")
    expect(contentType("install.sh")).toBe("text/plain; charset=utf-8")
    expect(contentType("INSTALL.md")).toBe("text/plain; charset=utf-8")
    expect(contentType("SHA256SUMS")).toBe("text/plain; charset=utf-8")
  })
})

describe("release text", () => {
  test("title and notes say what this is, how to install, and what is not signed or tested", () => {
    expect(releaseTitle(brand, "1.18.31")).toBe("XCode by SimplifyX 1.18.31 (terminal version)")
    const notes = releaseNotes(brand, "1.18.31", "kureelvinay/xcode-overlay")
    expect(notes).toContain("sh install.sh")
    expect(notes).toContain("install.ps1")
    expect(notes).toContain("not code-signed")
    expect(notes).toContain("has not been run on Windows")
    // a private repo's assets need a signed-in browser or a token: say so, or the first download attempt 404s
    expect(notes).toContain("private")
    expect(notes).toContain("https://github.com/anomalyco/opencode/releases/tag/v1.18.31")
  })
})

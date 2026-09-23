import { describe, expect, test } from "bun:test"
import { loadBrand } from "../src/brand"
import { bundleDir, contentType, missingAssets, releaseNotes, releaseTag, releaseTitle } from "../src/publish"

const brand = loadBrand()

describe("missingAssets", () => {
  const local = [
    { name: "simplify-code-darwin-arm64.zip", size: 100 },
    { name: "install.sh", size: 10 },
    { name: "SHA256SUMS", size: 5 },
  ]
  test("uploads everything to a new release", () => {
    expect(missingAssets(local, [])).toEqual({ upload: local, replace: [] })
  })
  test("skips what is already there with the same size, so an interrupted upload resumes", () => {
    const remote = [{ id: 1, name: "simplify-code-darwin-arm64.zip", size: 100, state: "uploaded" }]
    expect(missingAssets(local, remote).upload.map((a) => a.name)).toEqual(["install.sh", "SHA256SUMS"])
  })
  test("replaces a partial or stale asset instead of trusting it", () => {
    const remote = [
      { id: 7, name: "simplify-code-darwin-arm64.zip", size: 40, state: "uploaded" }, // wrong size: an older build
      { id: 8, name: "install.sh", size: 10, state: "starter" }, // GitHub's state for an upload that never finished
    ]
    const plan = missingAssets(local, remote)
    expect(plan.replace.map((a) => a.id)).toEqual([7, 8])
    expect(plan.upload.map((a) => a.name)).toEqual(["simplify-code-darwin-arm64.zip", "install.sh", "SHA256SUMS"])
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
    expect(releaseTitle(brand, "1.18.31")).toBe("Simplify Code by SimplifyX 1.18.31 (terminal version)")
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

describe("the desktop bundle is its own release", () => {
  test("gets its own tag, so it never collides with the terminal bundle's INSTALL.md and SHA256SUMS", () => {
    expect(releaseTag("1.18.31", "package")).toBe("v1.18.31")
    expect(releaseTag("1.18.31", "desktop")).toBe("v1.18.31-desktop")
  })
  test("is titled as the desktop app", () => {
    expect(releaseTitle(brand, "1.18.31", "desktop")).toBe("Simplify Code by SimplifyX 1.18.31 (desktop app)")
  })
  test("its notes give the desktop install commands and the same plain warnings", () => {
    const notes = releaseNotes(brand, "1.18.31", "kureelvinay/xcode-overlay", "desktop")
    expect(notes).toContain("sh install-mac.sh")
    expect(notes).toContain("install-windows.ps1")
    expect(notes).toContain("SimplifyCode-mac-apple-silicon.zip")
    expect(notes).toContain("not signed")
    expect(notes).toContain("has not been run on Windows")
    expect(notes).toContain("does not update itself")
    expect(notes).toContain("gh release download v1.18.31-desktop --repo kureelvinay/xcode-overlay")
    expect(notes).not.toContain("sh install.sh")
  })
})

describe("contentType for desktop files", () => {
  test("a Windows installer is binary, not text", () => {
    expect(contentType("SimplifyCode-windows-x64-setup.exe")).toBe("application/octet-stream")
    expect(contentType("install-windows.ps1")).toBe("text/plain; charset=utf-8")
  })
})

describe("release notes follow the brand", () => {
  test("file names come from the brand, not from a copy that a rename would leave behind", () => {
    const terminal = releaseNotes(brand, "1.18.31", "o/r")
    expect(terminal).toContain("simplify-code-darwin-arm64.zip")
    expect(terminal).toContain("simplify-code-windows-x64-baseline.zip")
    const desktop = releaseNotes(brand, "1.18.31", "o/r", "desktop")
    expect(desktop).toContain("SimplifyCode-windows-arm64-setup.exe")
    for (const notes of [terminal, desktop]) expect(notes.toLowerCase()).not.toContain("xcode")
  })
})

describe("a custom tag", () => {
  test("is what the download command in the notes uses, so the notes never point at a different release", () => {
    expect(releaseNotes(brand, "1.18.31", "o/r", "package", "simplify-code-v1.18.31")).toContain("gh release download simplify-code-v1.18.31 --repo o/r")
    expect(releaseNotes(brand, "1.18.31", "o/r", "desktop", "simplify-code-desktop-v1.18.31")).toContain("gh release download simplify-code-desktop-v1.18.31 --repo o/r")
  })
})

describe("the team bundle is its own release, versioned by date because it changes on IT's schedule, not upstream's", () => {
  test("tag, title and folder", () => {
    expect(releaseTag("2026-09-22", "team")).toBe("team-2026-09-22")
    expect(releaseTitle(brand, "2026-09-22", "team")).toBe("Simplify Code by SimplifyX team configuration 2026-09-22")
    expect(bundleDir("/r", "1.18.31", "package")).toBe("/r/dist/1.18.31/package")
    expect(bundleDir("/r", "2026-09-22", "team")).toBe("/r/dist/team/2026-09-22")
  })
  test("notes say it is for administrators, what it enforces, and how to install", () => {
    const notes = releaseNotes(brand, "2026-09-22", "o/r", "team")
    expect(notes).toContain("sudo sh install-team.sh")
    expect(notes).toContain("install-team.ps1")
    expect(notes).toContain("administrator")
    expect(notes).toContain("plugin-lock")
    expect(notes).toContain("--connector-lock")
    expect(notes).toContain("gh release download team-2026-09-22 --repo o/r")
    expect(notes).toContain("placeholder")
  })
})

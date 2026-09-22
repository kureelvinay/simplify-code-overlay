import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { checkBunVersion, EXIT, newerVersions, parseArgs, PipelineError } from "../src/pipeline"

describe("parseArgs", () => {
  test("parses local with version and skip flag", () => {
    expect(parseArgs(["--local", "--version", "1.18.31", "--skip-web-ui"])).toEqual({ mode: "local", version: "1.18.31", skipWebUi: true })
  })
  test("parses check without version", () => {
    expect(parseArgs(["--check"])).toEqual({ mode: "check", version: undefined, skipWebUi: false })
  })
  test("parses desktop mode", () => {
    expect(parseArgs(["--desktop", "--version", "1.18.31"])).toEqual({ mode: "desktop", version: "1.18.31", skipWebUi: false })
    expect(parseArgs(["--desktop-package", "--version", "1.18.31"])).toEqual({ mode: "desktop-package", version: "1.18.31", skipWebUi: false })
  })
  test("parses package mode", () => {
    expect(parseArgs(["--package", "--version", "1.18.31"]).mode).toBe("package")
  })
  test("parses launcher mode", () => {
    expect(parseArgs(["--launcher"]).mode).toBe("launcher")
  })
  test("rejects a missing mode", () => {
    expect(() => parseArgs(["--version", "1.0.0"])).toThrow("usage:")
  })
  test("rejects a malformed version", () => {
    expect(() => parseArgs(["--local", "--version", "v1.18"])).toThrow("version must look like")
  })
  test("rejects --version with nothing after it", () => {
    expect(() => parseArgs(["--local", "--version"])).toThrow("--version needs a value")
  })
  test("rejects --version followed by another flag", () => {
    expect(() => parseArgs(["--local", "--version", "--skip-web-ui"])).toThrow("--version needs a value")
  })
})

describe("checkBunVersion", () => {
  const withPackageManager = (pm: string | undefined) => {
    const dir = mkdtempSync(path.join(tmpdir(), "simplify-code-bun-"))
    writeFileSync(path.join(dir, "package.json"), JSON.stringify(pm ? { packageManager: pm } : {}))
    return dir
  }
  test("accepts a newer bun inside the caret range", () => {
    const dir = withPackageManager("bun@1.3.14")
    expect(checkBunVersion(dir, "1.3.20")).toBe("1.3.14")
    expect(checkBunVersion(dir, "1.4.0")).toBe("1.3.14")
    rmSync(dir, { recursive: true })
  })
  test("rejects a bun older than the pin with an install hint", () => {
    const dir = withPackageManager("bun@1.3.20")
    let error: unknown
    try {
      checkBunVersion(dir, "1.3.14")
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(PipelineError)
    expect((error as PipelineError).code).toBe(EXIT.toolchain)
    expect((error as PipelineError).message).toContain('bash -s "bun-v1.3.20"')
    rmSync(dir, { recursive: true })
  })
  test("rejects a different major", () => {
    const dir = withPackageManager("bun@1.3.14")
    expect(() => checkBunVersion(dir, "2.0.0")).toThrow("upstream needs bun ^1.3.14")
    rmSync(dir, { recursive: true })
  })
  test("rejects a missing packageManager field", () => {
    const dir = withPackageManager(undefined)
    expect(() => checkBunVersion(dir, "1.3.14")).toThrow("no packageManager")
    rmSync(dir, { recursive: true })
  })
})

describe("PipelineError", () => {
  test("carries its code", () => {
    expect(new PipelineError("x", EXIT.publish).code).toBe(6)
    expect(EXIT.input).toBe(1)
  })
})

describe("newerVersions", () => {
  test("returns ascending versions newer than current", () => {
    expect(newerVersions(["1.18.31", "1.18.29", "1.18.30", "1.19.0"], "1.18.29")).toEqual(["1.18.30", "1.18.31", "1.19.0"])
  })
  test("returns everything when nothing is published yet", () => {
    expect(newerVersions(["1.18.31", "1.18.30"], undefined)).toEqual(["1.18.30", "1.18.31"])
  })
  test("ignores prereleases and junk", () => {
    expect(newerVersions(["1.18.31", "0.0.0-dev-2026", "nightly"], "1.18.30")).toEqual(["1.18.31"])
  })
})

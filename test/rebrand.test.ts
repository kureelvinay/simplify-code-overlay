import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { applyTransforms, countOccurrences, planTransforms, TransformError, type Transform } from "../src/rebrand"

let root: string
let brandDir: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "rebrand-root-"))
  brandDir = mkdtempSync(path.join(tmpdir(), "rebrand-brand-"))
  mkdirSync(path.join(root, "a"), { recursive: true })
  writeFileSync(path.join(root, "a/title.ts"), 'setTitle("OpenCode")\nsetTitle("OpenCode")\n')
  writeFileSync(path.join(root, "a/logo.ts"), "export const logo = 'upstream'\n")
  writeFileSync(path.join(brandDir, "logo.ts"), "export const logo = 'brand'\n")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(brandDir, { recursive: true, force: true })
})

const vars = { productName: "Simplify Code" }

describe("countOccurrences", () => {
  test("counts non-overlapping matches", () => {
    expect(countOccurrences("ab ab ab", "ab")).toBe(3)
    expect(countOccurrences("abc", "zz")).toBe(0)
  })
})

describe("applyTransforms", () => {
  test("applies an edit with a filled placeholder", () => {
    const t: Transform[] = [{ kind: "edit", file: "a/title.ts", find: 'setTitle("OpenCode")', replace: 'setTitle("{{productName}}")', count: 2 }]
    const written = applyTransforms(root, t, vars, brandDir)
    expect(written).toEqual(["a/title.ts"])
    expect(readFileSync(path.join(root, "a/title.ts"), "utf8")).toBe('setTitle("Simplify Code")\nsetTitle("Simplify Code")\n')
  })

  test("applies a drop-in", () => {
    const t: Transform[] = [{ kind: "dropin", file: "a/logo.ts", source: "logo.ts" }]
    applyTransforms(root, t, vars, brandDir)
    expect(readFileSync(path.join(root, "a/logo.ts"), "utf8")).toBe("export const logo = 'brand'\n")
  })

  test("chains two edits on the same file", () => {
    const t: Transform[] = [
      { kind: "edit", file: "a/title.ts", find: 'setTitle("OpenCode")', replace: 'setTitle("{{productName}}")', count: 2 },
      { kind: "edit", file: "a/title.ts", find: "setTitle", replace: "setWindowTitle", count: 2 },
    ]
    applyTransforms(root, t, vars, brandDir)
    expect(readFileSync(path.join(root, "a/title.ts"), "utf8")).toBe('setWindowTitle("Simplify Code")\nsetWindowTitle("Simplify Code")\n')
  })

  test("fails on count mismatch and writes nothing", () => {
    const t: Transform[] = [
      { kind: "dropin", file: "a/logo.ts", source: "logo.ts" },
      { kind: "edit", file: "a/title.ts", find: 'setTitle("OpenCode")', replace: "x", count: 1 },
    ]
    let error: unknown
    try {
      applyTransforms(root, t, vars, brandDir)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(TransformError)
    const te = error as TransformError
    expect(te.file).toBe("a/title.ts")
    expect(te.expected).toBe(1)
    expect(te.actual).toBe(2)
    expect(te.message).toContain("a/title.ts")
    expect(te.message).toContain('setTitle(\\"OpenCode\\")')
    // the drop-in that came first must NOT have been written
    expect(readFileSync(path.join(root, "a/logo.ts"), "utf8")).toBe("export const logo = 'upstream'\n")
  })

  test("fails when the upstream file is missing", () => {
    const t: Transform[] = [{ kind: "edit", file: "a/nope.ts", find: "x", replace: "y", count: 1 }]
    expect(() => applyTransforms(root, t, vars, brandDir)).toThrow("upstream file missing: a/nope.ts")
  })

  test("fails when the brand source is missing", () => {
    const t: Transform[] = [{ kind: "dropin", file: "a/logo.ts", source: "nope.ts" }]
    expect(() => applyTransforms(root, t, vars, brandDir)).toThrow("brand file missing: nope.ts")
  })

  test("planTransforms does not touch disk", () => {
    const t: Transform[] = [{ kind: "dropin", file: "a/logo.ts", source: "logo.ts" }]
    const plan = planTransforms(root, t, vars, brandDir)
    expect(plan).toHaveLength(1)
    expect(plan[0].content).toBe("export const logo = 'brand'\n")
    expect(readFileSync(path.join(root, "a/logo.ts"), "utf8")).toBe("export const logo = 'upstream'\n")
  })
})

describe("binary drop-ins", () => {
  test("copies bytes unchanged", () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x00, 0x01])
    writeFileSync(path.join(root, "a/icon.png"), Buffer.from([1, 2, 3]))
    writeFileSync(path.join(brandDir, "icon.png"), bytes)
    applyTransforms(root, [{ kind: "dropin", file: "a/icon.png", source: "icon.png" }], vars, brandDir)
    expect(Buffer.compare(readFileSync(path.join(root, "a/icon.png")), bytes)).toBe(0)
  })
})

describe("json transforms", () => {
  beforeEach(() => {
    writeFileSync(path.join(root, "a/theme.json"), JSON.stringify({ name: "OC-2", light: { palette: { primary: "#dcde8d", ink: "#171311" } } }, null, 2) + "\n")
  })

  test("sets existing keys by dot path, fills placeholders, keeps 2-space formatting", () => {
    const t: Transform[] = [{ kind: "json", file: "a/theme.json", set: { name: "{{productName}}", "light.palette.primary": "#7d2b8c" } }]
    expect(applyTransforms(root, t, vars, brandDir)).toEqual(["a/theme.json"])
    const text = readFileSync(path.join(root, "a/theme.json"), "utf8")
    expect(JSON.parse(text)).toEqual({ name: "Simplify Code", light: { palette: { primary: "#7d2b8c", ink: "#171311" } } })
    expect(text).toContain('\n  "name": "Simplify Code",\n')
    expect(text.endsWith("}\n")).toBe(true)
  })

  test("fails loudly when a path no longer exists upstream, and writes nothing", () => {
    const before = readFileSync(path.join(root, "a/theme.json"), "utf8")
    const t: Transform[] = [{ kind: "json", file: "a/theme.json", set: { name: "x", "light.palette.accent": "#fff" } }]
    let error: unknown
    try {
      applyTransforms(root, t, vars, brandDir)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(TransformError)
    expect((error as TransformError).find).toBe("light.palette.accent")
    expect(readFileSync(path.join(root, "a/theme.json"), "utf8")).toBe(before)
  })
})

describe("rule transforms", () => {
  beforeEach(() => {
    mkdirSync(path.join(root, "i18n"), { recursive: true })
    writeFileSync(path.join(root, "i18n/en.ts"), 'a: "Welcome to OpenCode",\nb: "OpenCode Zen gives OpenCode users models",\nc: "OpenCode Go",\n')
    writeFileSync(path.join(root, "i18n/fi.ts"), 'a: "Tervetuloa OpenCodeen",\n')
    writeFileSync(path.join(root, "i18n/index.ts"), "export const locales = []\n")
    writeFileSync(path.join(root, "i18n/parity.test.ts"), 'expect("OpenCode")\n')
  })
  const rule: Transform = {
    kind: "rule",
    files: "i18n/*.ts",
    skip: [".test.ts"],
    find: "OpenCode",
    replace: "{{productName}}",
    except: ["OpenCode Zen", "OpenCode Go"],
    minFiles: 2,
  }

  test("replaces every occurrence except the protected phrases", () => {
    const written = applyTransforms(root, [rule], vars, brandDir).sort()
    expect(written).toEqual(["i18n/en.ts", "i18n/fi.ts"])
    expect(readFileSync(path.join(root, "i18n/en.ts"), "utf8")).toBe(
      'a: "Welcome to Simplify Code",\nb: "OpenCode Zen gives Simplify Code users models",\nc: "OpenCode Go",\n',
    )
    expect(readFileSync(path.join(root, "i18n/fi.ts"), "utf8")).toBe('a: "Tervetuloa Simplify Codeen",\n')
  })

  test("leaves skipped files and files without the token untouched", () => {
    applyTransforms(root, [rule], vars, brandDir)
    expect(readFileSync(path.join(root, "i18n/parity.test.ts"), "utf8")).toBe('expect("OpenCode")\n')
    expect(readFileSync(path.join(root, "i18n/index.ts"), "utf8")).toBe("export const locales = []\n")
  })

  test("fails loudly when fewer files than minFiles change", () => {
    let error: unknown
    try {
      applyTransforms(root, [{ ...rule, minFiles: 3 }], vars, brandDir)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(TransformError)
    expect((error as TransformError).file).toBe("i18n/*.ts")
    expect((error as TransformError).expected).toBe(3)
    expect((error as TransformError).actual).toBe(2)
    expect(readFileSync(path.join(root, "i18n/en.ts"), "utf8")).toContain("Welcome to OpenCode")
  })
})

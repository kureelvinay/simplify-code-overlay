import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { go, logo, marks } from "../brand/logo"

const FIXTURES = path.join(import.meta.dir, "fixtures/upstream")
const HEX = /^#[0-9a-f]{6}$/

describe("brand/logo.ts", () => {
  test("keeps upstream's export shape", () => {
    expect(marks).toBe("_^~,")
    expect(go.left).toHaveLength(4)
    expect(go.right).toHaveLength(4)
  })

  test("left and right have four rows of uniform width", () => {
    expect(logo.left).toHaveLength(4)
    expect(logo.right).toHaveLength(4)
    const widths = (rows: string[]) => new Set(rows.map((r) => [...r].length))
    expect(widths(logo.left).size).toBe(1)
    expect(widths(logo.right).size).toBe(1)
  })

  test("right block is upstream's 'code' glyphs", () => {
    const upstream = readFileSync(path.join(FIXTURES, "packages/tui/src/logo.ts"), "utf8")
    for (const row of logo.right) expect(upstream).toContain(JSON.stringify(row))
  })

  test("only uses characters the renderer understands", () => {
    const allowed = new Set([..."█▀▄ ", ...marks])
    for (const row of [...logo.left, ...logo.right]) {
      for (const ch of row) expect(allowed.has(ch)).toBe(true)
    }
  })
})

describe("brand/theme.json", () => {
  const brand = JSON.parse(readFileSync(path.join(import.meta.dir, "../brand/theme.json"), "utf8"))
  const upstream = JSON.parse(readFileSync(path.join(FIXTURES, "packages/tui/src/theme/assets/opencode.json"), "utf8"))

  test("has exactly upstream's theme keys", () => {
    expect(Object.keys(brand.theme).sort()).toEqual(Object.keys(upstream.theme).sort())
  })

  test("every referenced def exists and every def is a hex color", () => {
    for (const value of Object.values(brand.defs)) expect(value).toMatch(HEX)
    for (const [key, entry] of Object.entries<Record<string, string>>(brand.theme)) {
      for (const mode of ["dark", "light"]) {
        const ref = entry[mode]
        const ok = HEX.test(ref) || ref in brand.defs
        if (!ok) throw new Error(`${key}.${mode} references unknown def "${ref}"`)
      }
    }
  })

  test("uses the SimplifyX palette", () => {
    expect(brand.defs.lightStep9).toBe("#7d2b8c")
    expect(brand.defs.lightStep12).toBe("#1f242d")
    expect(brand.defs.darkSecondary).toBe("#4de8f9")
    expect(brand.defs.lightSecondary).toBe("#1863dc")
  })
})

describe("brand/icon.png", () => {
  const png = readFileSync(path.join(import.meta.dir, "../brand/icon.png"))
  test("is a 1024x1024 RGBA PNG", () => {
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR")
    expect(png.readUInt32BE(16)).toBe(1024)
    expect(png.readUInt32BE(20)).toBe(1024)
    expect(png[24]).toBe(8) // bit depth
    expect(png[25]).toBe(6) // colour type RGBA
  })
})

describe("brand/desktop/icons", () => {
  const dir = path.join(import.meta.dir, "../brand/desktop/icons")
  test("has a real .icns and .ico", () => {
    expect(readFileSync(path.join(dir, "icon.icns")).subarray(0, 4).toString("latin1")).toBe("icns")
    const ico = readFileSync(path.join(dir, "icon.ico"))
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]) // reserved, type = icon
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(3) // several sizes for Windows
  })
  test("PNG sizes match the upstream files they replace", () => {
    const sizes: Record<string, number> = { "icon.png": 512, "dock.png": 256, "32x32.png": 32, "64x64.png": 64, "128x128.png": 128, "128x128@2x.png": 256 }
    for (const [name, px] of Object.entries(sizes)) {
      const png = readFileSync(path.join(dir, name))
      expect({ name, w: png.readUInt32BE(16), h: png.readUInt32BE(20) }).toEqual({ name, w: px, h: px })
    }
  })
})

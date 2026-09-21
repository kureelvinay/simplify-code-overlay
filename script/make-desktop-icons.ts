#!/usr/bin/env bun
// Derives the desktop app's icon set in brand/desktop/icons/ from brand/icon.png.
// File names and pixel sizes match the upstream files they replace
// (packages/desktop/icons/prod). macOS only: uses `sips` and `iconutil`.
//
//   bun run script/make-desktop-icons.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"

const root = path.resolve(import.meta.dir, "..")
const icon = path.join(root, "brand/icon.png")
const out = path.join(root, "brand/desktop/icons")
mkdirSync(out, { recursive: true })
const work = mkdtempSync(path.join(tmpdir(), "simplify-code-desktop-icons-"))
const resize = async (px: number, file: string) => void (await $`sips -z ${px} ${px} ${icon} --out ${file}`.quiet())

const pngs: Record<string, number> = { "icon.png": 512, "dock.png": 256, "32x32.png": 32, "64x64.png": 64, "128x128.png": 128, "128x128@2x.png": 256 }
for (const [name, px] of Object.entries(pngs)) await resize(px, path.join(out, name))

// macOS: every size iconutil expects
const iconset = path.join(work, "icon.iconset")
mkdirSync(iconset)
for (const size of [16, 32, 128, 256, 512]) {
  await resize(size, path.join(iconset, `icon_${size}x${size}.png`))
  await resize(size * 2, path.join(iconset, `icon_${size}x${size}@2x.png`))
}
await $`iconutil -c icns ${iconset} -o ${path.join(out, "icon.icns")}`.quiet()

// Windows: an .ico container with PNG payloads (a width byte of 0 means 256)
const entries: { px: number; data: Buffer }[] = []
for (const px of [16, 32, 48, 64, 128, 256]) {
  const file = path.join(work, `${px}.png`)
  await resize(px, file)
  entries.push({ px, data: readFileSync(file) })
}
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(entries.length, 4)
let offset = 6 + 16 * entries.length
const directory = entries.map(({ px, data }) => {
  const e = Buffer.alloc(16)
  e[0] = px === 256 ? 0 : px
  e[1] = px === 256 ? 0 : px
  e.writeUInt16LE(1, 4)
  e.writeUInt16LE(32, 6)
  e.writeUInt32LE(data.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += data.length
  return e
})
writeFileSync(path.join(out, "icon.ico"), Buffer.concat([header, ...directory, ...entries.map((e) => e.data)]))

rmSync(work, { recursive: true, force: true })
console.log(`wrote ${Object.keys(pngs).length + 2} files to ${out}`)

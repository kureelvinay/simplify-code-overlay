#!/usr/bin/env bun
// Derives the GUI favicon set in brand/gui/favicon/ from brand/icon.png.
// macOS only (uses `sips`). Re-run after regenerating the icon, commit the results.
//
//   bun run script/make-favicons.ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"

const root = path.resolve(import.meta.dir, "..")
const icon = path.join(root, "brand/icon.png")
const out = path.join(root, "brand/gui/favicon")
mkdirSync(out, { recursive: true })

const pngs: Record<string, number> = {
  "apple-touch-icon-v3.png": 180,
  "favicon-96x96-v3.png": 96,
  "web-app-manifest-192x192.png": 192,
  "web-app-manifest-512x512.png": 512,
}
for (const [name, px] of Object.entries(pngs)) {
  await $`sips -z ${px} ${px} ${icon} --out ${path.join(out, name)}`.quiet()
}

// .ico is a tiny container; modern readers accept PNG payloads, so embed 32 and 48px PNGs.
const work = mkdtempSync(path.join(tmpdir(), "xcode-ico-"))
const entries: { px: number; data: Buffer }[] = []
for (const px of [32, 48]) {
  const file = path.join(work, `${px}.png`)
  await $`sips -z ${px} ${px} ${icon} --out ${file}`.quiet()
  entries.push({ px, data: readFileSync(file) })
}
rmSync(work, { recursive: true, force: true })
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(entries.length, 4)
let offset = 6 + 16 * entries.length
const dir = entries.map(({ px, data }) => {
  const e = Buffer.alloc(16)
  e[0] = px
  e[1] = px
  e.writeUInt16LE(1, 4) // colour planes
  e.writeUInt16LE(32, 6) // bits per pixel
  e.writeUInt32LE(data.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += data.length
  return e
})
writeFileSync(path.join(out, "favicon-v3.ico"), Buffer.concat([header, ...dir, ...entries.map((e) => e.data)]))

// Same artwork as script/make-icon.ts, as vector.
writeFileSync(
  path.join(out, "favicon-v3.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8f35a0"/>
      <stop offset="1" stop-color="#3d0c46"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-width="104" stroke-linecap="round">
    <line x1="257" y1="302" x2="627" y2="672"/>
    <line x1="257" y1="672" x2="627" y2="302"/>
  </g>
  <line x1="737" y1="712" x2="847" y2="712" stroke="#4de8f9" stroke-width="60" stroke-linecap="round"/>
</svg>
`,
)
console.log(`wrote ${Object.keys(pngs).length + 2} files to ${out}`)

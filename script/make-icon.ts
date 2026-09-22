#!/usr/bin/env bun
// Generates brand/icon.png (1024x1024 RGBA): a SimplifyX-purple rounded square with a
// white pixel-font S (the same letter shape as the wordmark) and a teal terminal cursor. Shapes are signed-distance fields, so edges are
// anti-aliased without supersampling. Re-run after changing the colours, commit the PNG.
//
//   bun run script/make-icon.ts
import { writeFileSync } from "node:fs"
import path from "node:path"
import { deflateSync } from "node:zlib"

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB

const SIZE = 1024
const CENTER = SIZE / 2
const TOP = hex("#8f35a0") // lightened brand purple #7d2b8c
const BOTTOM = hex("#3d0c46") // darkened deep purple #51115c
const WHITE = hex("#ffffff")
const TEAL = hex("#4de8f9")

// Apple's icon grid: an 824px rounded square on a 1024px canvas.
const PLATE_HALF = 412
const PLATE_RADIUS = 185

function sdRoundRect(x: number, y: number, half: number, r: number): number {
  const qx = Math.abs(x) - half + r
  const qy = Math.abs(y) - half + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function sdCapsule(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number): number {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
  return Math.hypot(pax - bax * h, pay - bay * h) - r
}

const coverage = (distance: number) => Math.max(0, Math.min(1, 0.5 - distance))
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

function sdBox(x: number, y: number, cx: number, cy: number, halfW: number, halfH: number, r: number): number {
  const qx = Math.abs(x - cx) - halfW + r
  const qy = Math.abs(y - cy) - halfH + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

// The S sits left of centre to leave room for the cursor, like a prompt: "S_". It is the wordmark's
// S: 4 blocks wide, 5 tall, as three bars joined by two single blocks.
const S = { left: -290, top: -230, block: 92 }
const S_BOXES: [col: number, row: number, cols: number, rows: number][] = [
  [0, 0, 4, 1],
  [0, 1, 1, 1],
  [0, 2, 4, 1],
  [3, 3, 1, 1],
  [0, 4, 4, 1],
]
const CURSOR = { x1: 165, x2: 275, y: 200, stroke: 30 }

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1)) // one filter byte per row
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1)
  raw[row] = 0
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5 - CENTER
    const py = y + 0.5 - CENTER

    const plate = coverage(sdRoundRect(px, py, PLATE_HALF, PLATE_RADIUS))
    const t = Math.max(0, Math.min(1, (px + py) / (4 * PLATE_HALF) + 0.5))
    let color = mix(TOP, BOTTOM, t)

    let letter = Infinity
    for (const [col, row, cols, rows] of S_BOXES) {
      const halfW = (cols * S.block) / 2
      const halfH = (rows * S.block) / 2
      // +1 so neighbouring boxes overlap and no hairline shows at the joins
      letter = Math.min(letter, sdBox(px, py, S.left + col * S.block + halfW, S.top + row * S.block + halfH, halfW + 1, halfH + 1, 0)) // square corners: rounded ones leave notches where the boxes join
    }
    color = mix(color, WHITE, coverage(letter))
    color = mix(color, TEAL, coverage(sdCapsule(px, py, CURSOR.x1, CURSOR.y, CURSOR.x2, CURSOR.y, CURSOR.stroke)))

    const o = row + 1 + x * 4
    raw[o] = Math.round(color[0])
    raw[o + 1] = Math.round(color[1])
    raw[o + 2] = Math.round(color[2])
    raw[o + 3] = Math.round(plate * 255)
  }
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(Number(Bun.hash.crc32(body)) >>> 0, 8 + data.length)
  return out
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type: RGBA
const png = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
])

const out = path.resolve(import.meta.dir, "../brand/icon.png")
writeFileSync(out, png)
console.log(`wrote ${out} (${png.length} bytes)`)

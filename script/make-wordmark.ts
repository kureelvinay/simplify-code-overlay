#!/usr/bin/env bun
// Prints the artwork for the first word of the product name in upstream's pixel font, for pasting
// into the static drop-ins (brand/logo.ts, brand/gui/logo.tsx, brand/gui/wordmark-v2.tsx). Those files
// are copied into upstream's tree, so they cannot import anything from here.
//
//   bun run script/make-wordmark.ts simplify
//
// Upstream's letters sit on a grid: 5 rows of body (rows 1-5), one ascender row above (row 0, used by
// "d") and one descender row below (row 6). The terminal logo packs two grid rows into each text row
// with half-block characters, which is why it is exactly 4 text rows tall.
export const GLYPHS: Record<string, string[]> = {
  //    row0    row1     row2     row3     row4     row5     row6
  s: ["....", "####", "#...", "####", "...#", "####", "...."],
  i: ["#", ".", "#", "#", "#", "#", "."],
  m: [".....", "#####", "#.#.#", "#.#.#", "#.#.#", "#.#.#", "....."],
  p: ["....", "####", "#..#", "#..#", "#..#", "####", "#..."],
  l: ["#", "#", "#", "#", "#", "#", "."],
  f: [".##", ".#.", "###", ".#.", ".#.", ".#.", "..."],
  y: ["....", "#..#", "#..#", "#..#", "#..#", "####", "...#"],
}

/** The word as one bitmap: 7 rows, letters separated by one empty column. */
export function bitmap(word: string): string[] {
  const rows = Array.from({ length: 7 }, () => "")
  ;[...word].forEach((ch, n) => {
    const glyph = GLYPHS[ch]
    if (!glyph) throw new Error(`no glyph for ${JSON.stringify(ch)}; add it to GLYPHS`)
    for (let r = 0; r < 7; r++) rows[r] += (n ? "." : "") + glyph[r]
  })
  return rows
}

/** Four text rows of half blocks, the shape brand/logo.ts needs. */
export function terminalRows(word: string): string[] {
  const px = bitmap(word)
  const on = (r: number, c: number) => r >= 0 && px[r][c] === "#"
  return [0, 1, 2, 3].map((t) =>
    [...px[0]].map((_, c) => (on(2 * t - 1, c) ? (on(2 * t, c) ? "█" : "▀") : on(2 * t, c) ? "▄" : " ")).join(""),
  )
}

/** One SVG path of horizontal runs. `unit` is the block size, (x, y) the top-left of row 0. */
export function svgPath(word: string, unit: number, x: number, y: number): { d: string; width: number } {
  const px = bitmap(word)
  const n = (v: number) => String(Number(v.toFixed(3)))
  const parts: string[] = []
  px.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== "#") continue
      let end = c
      while (end + 1 < row.length && row[end + 1] === "#") end++
      const x0 = x + c * unit
      const x1 = x + (end + 1) * unit
      const y0 = y + r * unit
      parts.push(`M${n(x0)} ${n(y0)}H${n(x1)}V${n(y0 + unit)}H${n(x0)}Z`)
      c = end
    }
  })
  return { d: parts.join(""), width: px[0].length * unit }
}

if (import.meta.main) {
  const word = process.argv[2]
  if (!word) {
    console.error("usage: bun run script/make-wordmark.ts <word>")
    process.exit(1)
  }
  console.log("terminal rows (brand/logo.ts, `left`):")
  console.log(JSON.stringify(terminalRows(word)))
  console.log(terminalRows(word).join("\n"))
  console.log(`\nbitmap is ${bitmap(word)[0].length} blocks wide`)
}

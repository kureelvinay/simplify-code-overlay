import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { $, Glob } from "bun"
import { fill } from "./brand"

/**
 * Four transform kinds, each with its own drift assertion:
 *  - dropin: overwrite a whole upstream file (text or binary) with one from brand/. The target must exist.
 *  - edit:   replace an exact string that must occur exactly `count` times.
 *  - json:   set values at dot paths in a JSON file. Every path must already exist upstream, so a
 *            renamed or removed key fails the run instead of being silently re-added.
 *  - rule:   in every file matching a glob, replace each `find` that is not part of an `except`
 *            phrase. At least `minFiles` files must change. For text that is too repetitive to list
 *            anchor by anchor (the brand name appears ~2,600 times across 65 locale files).
 */
export type Transform =
  | { kind: "dropin"; file: string; source: string }
  | { kind: "edit"; file: string; find: string; replace: string; count: number }
  | { kind: "json"; file: string; set: Record<string, string> }
  | { kind: "rule"; files: string; skip?: string[]; find: string; replace: string; except: string[]; minFiles: number }

export class TransformError extends Error {
  constructor(
    public readonly file: string,
    public readonly find: string,
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(
      `anchor drift in ${file}: expected ${expected} occurrence(s) of ${JSON.stringify(find)}, found ${actual}. ` +
        `Open the upstream diff for this file and update src/transforms.ts.`,
    )
    this.name = "TransformError"
  }
}

export function countOccurrences(text: string, find: string): number {
  return text.split(find).length - 1
}

export interface PendingWrite {
  path: string
  content: string | Buffer
}

/** Brand files are text unless they contain a NUL byte (PNG, ICO, ...). Text stays a string so later edits can chain. */
function readBrandFile(file: string): string | Buffer {
  const bytes = readFileSync(file)
  return bytes.subarray(0, 8000).includes(0) ? bytes : bytes.toString("utf8")
}

/** Replace every `find` that is not inside one of the `except` phrases. Returns the new text and the replacement count. */
function replaceOutside(text: string, find: string, replacement: string, except: string[]): [string, number] {
  // Park the protected phrases behind placeholders that cannot occur in source text.
  let parked = text
  except.forEach((phrase, i) => {
    parked = parked.split(phrase).join(`\u0000${i}\u0000`)
  })
  const count = countOccurrences(parked, find)
  let out = parked.split(find).join(replacement)
  except.forEach((phrase, i) => {
    out = out.split(`\u0000${i}\u0000`).join(phrase)
  })
  return [out, count]
}

/**
 * Compute every write without touching disk. Throws on the first problem so a
 * failed run leaves the upstream checkout untouched.
 */
export function planTransforms(
  root: string,
  transforms: Transform[],
  vars: Record<string, string>,
  brandDir: string,
): PendingWrite[] {
  const contents = new Map<string, string | Buffer>()

  const currentText = (target: string, file: string): string => {
    const current = contents.get(target) ?? readFileSync(target, "utf8")
    if (typeof current !== "string") throw new Error(`cannot edit ${file}: an earlier drop-in made it binary`)
    return current
  }

  for (const t of transforms) {
    if (t.kind === "rule") {
      const matches = [...new Glob(t.files).scanSync({ cwd: root })]
        .filter((rel) => !(t.skip ?? []).some((s) => rel.includes(s)))
        .sort()
      let changed = 0
      for (const rel of matches) {
        const target = path.join(root, rel)
        const [next, count] = replaceOutside(currentText(target, rel), t.find, fill(t.replace, vars), t.except)
        if (count === 0) continue
        contents.set(target, next)
        changed++
      }
      if (changed < t.minFiles) throw new TransformError(t.files, t.find, t.minFiles, changed)
      continue
    }

    const target = path.join(root, t.file)
    if (!existsSync(target)) throw new Error(`upstream file missing: ${t.file}`)

    if (t.kind === "dropin") {
      const source = path.join(brandDir, t.source)
      if (!existsSync(source)) throw new Error(`brand file missing: ${t.source}`)
      contents.set(target, readBrandFile(source))
      continue
    }

    if (t.kind === "json") {
      const doc = JSON.parse(currentText(target, t.file)) as Record<string, unknown>
      for (const [dotPath, value] of Object.entries(t.set)) {
        const keys = dotPath.split(".")
        const last = keys.pop()!
        let node: unknown = doc
        for (const key of keys) node = node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined
        if (node === null || typeof node !== "object" || !(last in (node as object))) {
          throw new TransformError(t.file, dotPath, 1, 0)
        }
        ;(node as Record<string, unknown>)[last] = fill(value, vars)
      }
      contents.set(target, JSON.stringify(doc, null, 2) + "\n")
      continue
    }

    const current = currentText(target, t.file)
    const actual = countOccurrences(current, t.find)
    if (actual !== t.count) throw new TransformError(t.file, t.find, t.count, actual)
    contents.set(target, current.split(t.find).join(fill(t.replace, vars)))
  }

  return [...contents].map(([p, content]) => ({ path: p, content }))
}

/** Plan, then write. Returns the root-relative paths that were written. */
export function applyTransforms(
  root: string,
  transforms: Transform[],
  vars: Record<string, string>,
  brandDir: string,
): string[] {
  const pending = planTransforms(root, transforms, vars, brandDir)
  for (const w of pending) writeFileSync(w.path, w.content)
  return pending.map((w) => path.relative(root, w.path))
}

/**
 * Shallow-clone `v<version>` of github.com/<repo> into <workDir>/<version>.
 * If the clone already exists, reset tracked files and drop untracked leftovers so
 * transforms can be re-applied to a clean tree (ignored node_modules and dist survive).
 */
export async function cloneUpstream(repo: string, version: string, workDir: string): Promise<string> {
  const dest = path.join(workDir, version)
  if (existsSync(path.join(dest, ".git"))) {
    await $`git -C ${dest} checkout -- .`
    await $`git -C ${dest} clean -fd`
    return dest
  }
  mkdirSync(workDir, { recursive: true })
  await $`git clone --depth 1 --branch v${version} https://github.com/${repo}.git ${dest}`
  return dest
}

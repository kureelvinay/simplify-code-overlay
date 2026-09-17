# XCode Rebrand Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `xcode-overlay` repo that clones an upstream OpenCode tag, applies fifteen brand transforms, builds it, packages it as `@simplifyx/xcode`, and installs the result on the requester's Mac (milestone 1), then publishes to an internal registry from CI (milestone 2).

**Architecture:** A Bun/TypeScript pipeline with three modules: `rebrand.ts` (clone + asserted transforms that fail loudly on upstream drift), `package.ts` (turn upstream's `dist/` into scoped npm packages), and `pipeline.ts` (the `--local` / `--release` / `--check` entry point). Brand data lives only in `brand/`. Upstream source is never committed; it is cloned into a git-ignored `work/` directory at run time.

**Tech Stack:** Bun 1.3.14 (`bun test`, `Bun.$` shell), TypeScript, Node built-ins (`node:fs`, `node:path`), npm (`pack`, `install -g`, `publish`), git, GitHub Actions, `gh` CLI (release mode only).

**Spec:** `docs/superpowers/specs/2026-09-17-xcode-rebrand-overlay-design.md`

## Global Constraints

- Upstream repo `anomalyco/opencode`, baseline tag `v1.18.31`. All anchors below were verified against that tag.
- Bun **major.minor must equal** upstream's `packageManager` field (`bun@1.3.14` for v1.18.31). Installed on the requester's Mac at `~/.bun/bin/bun`; in a fresh shell it is on `PATH`, otherwise call it by full path.
- Node 20 / npm 10 present on the requester's Mac at `~/.nvm/versions/node/v20.20.2/bin`.
- Product strings: `productName = "XCode"`, `tagline = "by SimplifyX"`, `npmScope = "@simplifyx"`, `npmPackage = "@simplifyx/xcode"`, `releaseRepo = "simplifyx/xcode-releases"` (placeholder), `upstreamRepo = "anomalyco/opencode"`.
- The command stays `opencode`. Never rename `.opencode`, `OPENCODE_*`, provider ids, or `.scriptName("opencode")`.
- Do **not** change strings naming "OpenCode Zen" or "OpenCode Go" (`footer.tsx:56`, `tips-view.tsx:278`, `dialog-provider.tsx:374-389`).
- Only two transform kinds: `dropin` and `edit`. Every `edit` has an exact `count`. A count mismatch stops the run and writes nothing.
- Version numbers mirror upstream exactly.
- Exit codes: drift 2, toolchain 3, build 4, smoke 5, publish 6.
- Every published package includes upstream's MIT `LICENSE`.
- Commit after every task. Commits from this repo use `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` as the last line.
- Repo root: `/Users/vinaykureel/Documents/xcode-overlay`. All paths below are relative to it.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `.bun-version`, `.gitignore` | Overlay toolchain pins and scripts |
| `brand/brand.json` | Product strings and package names (the only place brand text lives) |
| `brand/logo.ts` | Drop-in for upstream `packages/tui/src/logo.ts` |
| `brand/theme.json` | Drop-in for upstream `packages/tui/src/theme/assets/opencode.json` |
| `src/brand.ts` | Load/validate `brand.json`, derive placeholders, fill templates |
| `src/rebrand.ts` | `Transform` type, `TransformError`, `planTransforms`, `applyTransforms`, `cloneUpstream` |
| `src/transforms.ts` | The ordered transform list (data only) |
| `src/package.ts` | Rename platform packages, write meta package, `npm pack` |
| `src/pipeline.ts` | CLI: `--local`, `--release`, `--check`; Bun check; build; smoke test; publish |
| `test/fixtures/upstream/...` | Nine upstream files at v1.18.31 for offline tests |
| `test/brand.test.ts`, `test/rebrand.test.ts`, `test/transforms.test.ts`, `test/assets.test.ts`, `test/package.test.ts`, `test/pipeline.test.ts` | Unit tests, no network |
| `.github/workflows/rebrand.yml` | Thin CI wrapper |
| `README.md` | Developer install and maintainer runbook |

---

### Task 1: Repo scaffold and brand loader

**Files:**
- Create: `package.json`, `tsconfig.json`, `.bun-version`, `brand/brand.json`, `src/brand.ts`
- Modify: `.gitignore`
- Test: `test/brand.test.ts`

**Interfaces:**
- Produces: `interface Brand { productName; tagline; npmScope; npmPackage; releaseRepo; upstreamRepo }` (all `string`), `parseBrand(json: string): Brand`, `loadBrand(path?: string): Brand`, `placeholders(brand: Brand): Record<string,string>` (keys `productName`, `tagline`, `npmPackage`, `npmPackageEncoded`, `releaseRepo`), `fill(template: string, vars: Record<string,string>): string`, `const BRAND_DIR: string` (absolute path to `brand/` with trailing slash).

- [ ] **Step 1: Write toolchain files**

`package.json`:
```json
{
  "name": "xcode-overlay",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.14",
  "scripts": {
    "test": "bun test",
    "pipeline": "bun run src/pipeline.ts"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["bun"],
    "skipLibCheck": true
  },
  "include": ["src", "test", "brand"]
}
```

`.bun-version`:
```
1.3.14
```

Append to `.gitignore` (it already has `work/`, `dist/`, `node_modules/`):
```
bun.lock
```

Then run:
```bash
cd /Users/vinaykureel/Documents/xcode-overlay && ~/.bun/bin/bun install
```
Expected: `@types/bun` installed, no errors.

- [ ] **Step 2: Write brand.json**

`brand/brand.json`:
```json
{
  "productName": "XCode",
  "tagline": "by SimplifyX",
  "npmScope": "@simplifyx",
  "npmPackage": "@simplifyx/xcode",
  "releaseRepo": "simplifyx/xcode-releases",
  "upstreamRepo": "anomalyco/opencode"
}
```

- [ ] **Step 3: Write the failing tests**

`test/brand.test.ts`:
```ts
import { describe, expect, test } from "bun:test"
import { fill, loadBrand, parseBrand, placeholders } from "../src/brand"

const valid = {
  productName: "XCode",
  tagline: "by SimplifyX",
  npmScope: "@simplifyx",
  npmPackage: "@simplifyx/xcode",
  releaseRepo: "simplifyx/xcode-releases",
  upstreamRepo: "anomalyco/opencode",
}

describe("parseBrand", () => {
  test("accepts a complete brand", () => {
    expect(parseBrand(JSON.stringify(valid))).toEqual(valid)
  })

  test("rejects a missing key", () => {
    const { tagline, ...rest } = valid
    expect(() => parseBrand(JSON.stringify(rest))).toThrow('missing or empty "tagline"')
  })

  test("rejects an empty key", () => {
    expect(() => parseBrand(JSON.stringify({ ...valid, productName: "" }))).toThrow('missing or empty "productName"')
  })

  test("rejects a package outside the scope", () => {
    expect(() => parseBrand(JSON.stringify({ ...valid, npmPackage: "@other/xcode" }))).toThrow("must start with npmScope")
  })
})

describe("loadBrand", () => {
  test("loads the checked-in brand.json", () => {
    const brand = loadBrand()
    expect(brand.productName).toBe("XCode")
    expect(brand.npmPackage).toBe("@simplifyx/xcode")
  })
})

describe("placeholders", () => {
  test("derives the %2F-encoded package name", () => {
    const vars = placeholders(valid)
    expect(vars.npmPackageEncoded).toBe("@simplifyx%2Fxcode")
    expect(vars.productName).toBe("XCode")
    expect(vars.releaseRepo).toBe("simplifyx/xcode-releases")
  })
})

describe("fill", () => {
  test("replaces every placeholder", () => {
    expect(fill("{{productName}} {{tagline}}", placeholders(valid))).toBe("XCode by SimplifyX")
  })

  test("throws on an unknown placeholder", () => {
    expect(() => fill("{{nope}}", placeholders(valid))).toThrow("unknown placeholder {{nope}}")
  })

  test("leaves single-brace JSX alone", () => {
    expect(fill("{highlight}x{/highlight}", {})).toBe("{highlight}x{/highlight}")
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /Users/vinaykureel/Documents/xcode-overlay && ~/.bun/bin/bun test test/brand.test.ts`
Expected: FAIL, `Cannot find module "../src/brand"`.

- [ ] **Step 5: Implement src/brand.ts**

```ts
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export interface Brand {
  productName: string
  tagline: string
  npmScope: string
  npmPackage: string
  releaseRepo: string
  upstreamRepo: string
}

const REQUIRED: (keyof Brand)[] = ["productName", "tagline", "npmScope", "npmPackage", "releaseRepo", "upstreamRepo"]

/** Absolute path to the brand/ directory, with a trailing slash. */
export const BRAND_DIR = fileURLToPath(new URL("../brand/", import.meta.url))

export function parseBrand(json: string): Brand {
  const data = JSON.parse(json) as Record<string, unknown>
  for (const key of REQUIRED) {
    const value = data[key]
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`brand.json: missing or empty "${key}"`)
    }
  }
  const brand = data as unknown as Brand
  if (!brand.npmPackage.startsWith(`${brand.npmScope}/`)) {
    throw new Error(`brand.json: npmPackage "${brand.npmPackage}" must start with npmScope "${brand.npmScope}/"`)
  }
  return brand
}

export function loadBrand(path = `${BRAND_DIR}brand.json`): Brand {
  return parseBrand(readFileSync(path, "utf8"))
}

/** Values available as {{name}} inside transform replacement strings. */
export function placeholders(brand: Brand): Record<string, string> {
  return {
    productName: brand.productName,
    tagline: brand.tagline,
    npmPackage: brand.npmPackage,
    npmPackageEncoded: brand.npmPackage.replace("/", "%2F"),
    releaseRepo: brand.releaseRepo,
  }
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key]
    if (value === undefined) throw new Error(`unknown placeholder {{${key}}}`)
    return value
  })
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/vinaykureel/Documents/xcode-overlay && ~/.bun/bin/bun test test/brand.test.ts`
Expected: 9 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
cd /Users/vinaykureel/Documents/xcode-overlay && git add -A && git commit -m "feat: scaffold overlay repo and brand loader

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Transform engine

**Files:**
- Create: `src/rebrand.ts`
- Test: `test/rebrand.test.ts`

**Interfaces:**
- Consumes: `fill` from `src/brand.ts`.
- Produces:
  ```ts
  type Transform =
    | { kind: "dropin"; file: string; source: string }
    | { kind: "edit"; file: string; find: string; replace: string; count: number }
  class TransformError extends Error { file: string; find: string; expected: number; actual: number }
  function countOccurrences(text: string, find: string): number
  function planTransforms(root: string, transforms: Transform[], vars: Record<string,string>, brandDir: string): { path: string; content: string }[]
  function applyTransforms(root: string, transforms: Transform[], vars: Record<string,string>, brandDir: string): string[]  // relative paths written
  async function cloneUpstream(repo: string, version: string, workDir: string): Promise<string>  // returns clone dir
  ```
  `file` is relative to the upstream root; `source` is relative to `brandDir`. `applyTransforms` is all-or-nothing: it plans every transform first and writes only if all succeed.

- [ ] **Step 1: Write the failing tests**

`test/rebrand.test.ts`:
```ts
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

const vars = { productName: "XCode" }

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
    expect(readFileSync(path.join(root, "a/title.ts"), "utf8")).toBe('setTitle("XCode")\nsetTitle("XCode")\n')
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
    expect(readFileSync(path.join(root, "a/title.ts"), "utf8")).toBe('setWindowTitle("XCode")\nsetWindowTitle("XCode")\n')
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `~/.bun/bin/bun test test/rebrand.test.ts`
Expected: FAIL, `Cannot find module "../src/rebrand"`.

- [ ] **Step 3: Implement src/rebrand.ts**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { $ } from "bun"
import { fill } from "./brand"

export type Transform =
  | { kind: "dropin"; file: string; source: string }
  | { kind: "edit"; file: string; find: string; replace: string; count: number }

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
  content: string
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
  const contents = new Map<string, string>()

  for (const t of transforms) {
    const target = path.join(root, t.file)
    if (!existsSync(target)) throw new Error(`upstream file missing: ${t.file}`)

    if (t.kind === "dropin") {
      const source = path.join(brandDir, t.source)
      if (!existsSync(source)) throw new Error(`brand file missing: ${t.source}`)
      contents.set(target, readFileSync(source, "utf8"))
      continue
    }

    const current = contents.get(target) ?? readFileSync(target, "utf8")
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
 * If the clone already exists, reset tracked files so transforms can be
 * re-applied to a clean tree (node_modules and dist are untracked and kept).
 */
export async function cloneUpstream(repo: string, version: string, workDir: string): Promise<string> {
  const dest = path.join(workDir, version)
  if (existsSync(path.join(dest, ".git"))) {
    await $`git -C ${dest} checkout -- .`
    return dest
  }
  mkdirSync(workDir, { recursive: true })
  await $`git clone --depth 1 --branch v${version} https://github.com/${repo}.git ${dest}`
  return dest
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `~/.bun/bin/bun test test/rebrand.test.ts`
Expected: 8 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: asserted transform engine with all-or-nothing writes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Upstream fixtures and the transform list

**Files:**
- Create: `test/fixtures/upstream/**` (nine files, see Step 1), `src/transforms.ts`
- Test: `test/transforms.test.ts`

**Interfaces:**
- Consumes: `Transform`, `applyTransforms`, `TransformError` from `src/rebrand.ts`; `loadBrand`, `placeholders`, `BRAND_DIR` from `src/brand.ts`.
- Produces: `export const TRANSFORMS: Transform[]` (fifteen entries, spec Section 4.1 order). Also `export const UPSTREAM_FILES: string[]` listing the eight upstream files transforms touch (used by tests and by the README's drift runbook).

Note: the two drop-in transforms reference `brand/logo.ts` and `brand/theme.json`, which Task 4 creates. In this task the transform tests use temporary stand-in files for those two sources so the list is testable before Task 4.

- [ ] **Step 1: Fetch fixtures from the v1.18.31 tag**

```bash
cd /Users/vinaykureel/Documents/xcode-overlay
rm -rf work/fixtures-src
git clone --depth 1 --branch v1.18.31 https://github.com/anomalyco/opencode.git work/fixtures-src
for f in \
  packages/tui/src/logo.ts \
  packages/tui/src/theme/assets/opencode.json \
  packages/tui/src/component/logo.tsx \
  packages/tui/src/app.tsx \
  packages/tui/src/attention.ts \
  packages/tui/src/feature-plugins/home/tips-view.tsx \
  packages/tui/src/routes/session/permission.tsx \
  packages/opencode/src/installation/index.ts \
  packages/opencode/script/postinstall.mjs ; do
  mkdir -p "test/fixtures/upstream/$(dirname "$f")"
  cp "work/fixtures-src/$f" "test/fixtures/upstream/$f"
done
find test/fixtures -type f | wc -l
```
Expected: `9`.

- [ ] **Step 2: Write the failing test**

`test/transforms.test.ts`:
```ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadBrand, placeholders, BRAND_DIR } from "../src/brand"
import { applyTransforms, countOccurrences, TransformError } from "../src/rebrand"
import { TRANSFORMS, UPSTREAM_FILES } from "../src/transforms"

const FIXTURES = path.join(import.meta.dir, "fixtures/upstream")
const brand = loadBrand()
const vars = placeholders(brand)

let root: string
let brandDir: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "xcode-upstream-"))
  cpSync(FIXTURES, root, { recursive: true })
  // Use the real brand/ dir when Task 4 has produced the assets, else stand-ins.
  if (existsSync(path.join(BRAND_DIR, "logo.ts")) && existsSync(path.join(BRAND_DIR, "theme.json"))) {
    brandDir = BRAND_DIR
  } else {
    brandDir = mkdtempSync(path.join(tmpdir(), "xcode-brand-"))
    writeFileSync(path.join(brandDir, "logo.ts"), "export const logo = { left: [], right: [] }\nexport const go = { left: [], right: [] }\nexport const marks = \"_^~,\"\n")
    writeFileSync(path.join(brandDir, "theme.json"), '{"defs":{},"theme":{}}\n')
  }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  if (brandDir !== BRAND_DIR) rmSync(brandDir, { recursive: true, force: true })
})

const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")

describe("TRANSFORMS against v1.18.31 fixtures", () => {
  test("has fifteen entries touching eight files", () => {
    expect(TRANSFORMS).toHaveLength(15)
    expect(new Set(TRANSFORMS.map((t) => t.file)).size).toBe(8)
    expect(UPSTREAM_FILES).toHaveLength(8)
  })

  test("every anchor is found exactly as often as declared", () => {
    const written = applyTransforms(root, TRANSFORMS, vars, brandDir)
    expect(written.sort()).toEqual([...UPSTREAM_FILES].sort())
  })

  test("removes app-facing OpenCode strings but keeps Zen/Go product names", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    expect(countOccurrences(read("packages/tui/src/app.tsx"), "OpenCode")).toBe(0)
    expect(countOccurrences(read("packages/tui/src/attention.ts"), "OpenCode")).toBe(0)
    expect(countOccurrences(read("packages/tui/src/routes/session/permission.tsx"), "OpenCode")).toBe(0)
    const tips = read("packages/tui/src/feature-plugins/home/tips-view.tsx")
    expect(countOccurrences(tips, "OpenCode")).toBe(1)
    expect(tips).toContain("OpenCode Zen")
    expect(tips).toContain("prevent XCode from reading")
    expect(read("packages/tui/src/app.tsx")).toContain('setTerminalTitle("XCode")')
    expect(read("packages/tui/src/app.tsx")).toContain("Successfully updated to XCode v")
  })

  test("repoints the upgrader at the scoped package and release repo", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const inst = read("packages/opencode/src/installation/index.ts")
    expect(countOccurrences(inst, "opencode-ai")).toBe(0)
    expect(inst).not.toContain("anomalyco/opencode")
    expect(inst).toContain('"@simplifyx/xcode"')
    expect(inst).toContain("/@simplifyx%2Fxcode/${InstallationChannel}")
    expect(countOccurrences(inst, "@simplifyx/xcode@${target}")).toBe(3)
    expect(inst).toContain("https://api.github.com/repos/simplifyx/xcode-releases/releases/latest")
    // functional identifiers untouched
    expect(inst).toContain('? "opencode" :')
  })

  test("recolors the logo and adds the tagline", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const logo = read("packages/tui/src/component/logo.tsx")
    expect(logo).toContain("renderLine(line, theme.primary, false)")
    expect(logo).not.toContain("renderLine(line, theme.textMuted, false)")
    expect(logo).toContain('{"      by SimplifyX"}')
    expect(logo).toContain("renderLine(logo.right[index()], theme.text, true)")
  })

  test("drop-ins replace whole files", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    expect(read("packages/tui/src/logo.ts")).toBe(readFileSync(path.join(brandDir, "logo.ts"), "utf8"))
    expect(read("packages/tui/src/theme/assets/opencode.json")).toBe(readFileSync(path.join(brandDir, "theme.json"), "utf8"))
  })

  test("drift in one anchor stops the run before any write", () => {
    const file = path.join(root, "packages/tui/src/app.tsx")
    writeFileSync(file, readFileSync(file, "utf8").replace('setTerminalTitle("OpenCode")', 'setTerminalTitle("Renamed")'))
    let error: unknown
    try {
      applyTransforms(root, TRANSFORMS, vars, brandDir)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(TransformError)
    expect((error as TransformError).file).toBe("packages/tui/src/app.tsx")
    expect((error as TransformError).expected).toBe(2)
    expect((error as TransformError).actual).toBe(1)
    expect(read("packages/tui/src/logo.ts")).toBe(readFileSync(path.join(FIXTURES, "packages/tui/src/logo.ts"), "utf8"))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `~/.bun/bin/bun test test/transforms.test.ts`
Expected: FAIL, `Cannot find module "../src/transforms"`.

- [ ] **Step 4: Write src/transforms.ts**

Anchors are copied verbatim from v1.18.31. Keep the order.

```ts
import type { Transform } from "./rebrand"

const TUI = "packages/tui/src"
const INSTALL = "packages/opencode/src/installation/index.ts"

export const TRANSFORMS: Transform[] = [
  // 1. Logo glyphs
  { kind: "dropin", file: `${TUI}/logo.ts`, source: "logo.ts" },

  // 2. Brand palette becomes the embedded default theme (still named "opencode")
  { kind: "dropin", file: `${TUI}/theme/assets/opencode.json`, source: "theme.json" },

  // 3. Left block (the X) in brand primary
  {
    kind: "edit",
    file: `${TUI}/component/logo.tsx`,
    find: "renderLine(line, theme.textMuted, false)",
    replace: "renderLine(line, theme.primary, false)",
    count: 1,
  },

  // 4. Tagline row under the logo (six spaces align it under "Code")
  {
    kind: "edit",
    file: `${TUI}/component/logo.tsx`,
    find: "      </For>\n    </box>\n  )\n}",
    replace:
      "      </For>\n" +
      '      <box flexDirection="row">\n' +
      '        <text fg={theme.textMuted} selectable={false}>{"      {{tagline}}"}</text>\n' +
      "      </box>\n" +
      "    </box>\n  )\n}",
    count: 1,
  },

  // 5. Terminal title (set on startup and on focus)
  {
    kind: "edit",
    file: `${TUI}/app.tsx`,
    find: 'renderer.setTerminalTitle("OpenCode")',
    replace: 'renderer.setTerminalTitle("{{productName}}")',
    count: 2,
  },

  // 6. Update toast
  {
    kind: "edit",
    file: `${TUI}/app.tsx`,
    find: "Successfully updated to OpenCode v",
    replace: "Successfully updated to {{productName}} v",
    count: 1,
  },

  // 7. Notification profile name
  {
    kind: "edit",
    file: `${TUI}/attention.ts`,
    find: 'name: "OpenCode Default"',
    replace: 'name: "{{productName}} Default"',
    count: 1,
  },

  // 8-9. Home-screen tips (the "OpenCode Zen" tip is deliberately untouched)
  {
    kind: "edit",
    file: `${TUI}/feature-plugins/home/tips-view.tsx`,
    find: "prevent OpenCode from reading",
    replace: "prevent {{productName}} from reading",
    count: 1,
  },
  {
    kind: "edit",
    file: `${TUI}/feature-plugins/home/tips-view.tsx`,
    find: "headless API access to OpenCode",
    replace: "headless API access to {{productName}}",
    count: 1,
  },

  // 10-11. Permission dialog
  {
    kind: "edit",
    file: `${TUI}/routes/session/permission.tsx`,
    find: "until OpenCode is restarted",
    replace: "until {{productName}} is restarted",
    count: 2,
  },
  {
    kind: "edit",
    file: `${TUI}/routes/session/permission.tsx`,
    find: "Tell OpenCode what to do differently",
    replace: "Tell {{productName}} what to do differently",
    count: 1,
  },

  // 12. Install-method detection looks for our package in `npm list -g`
  {
    kind: "edit",
    file: INSTALL,
    find: '? "opencode" : "opencode-ai"',
    replace: '? "opencode" : "{{npmPackage}}"',
    count: 1,
  },

  // 13. Latest-version lookup on the registry from .npmrc (scoped names need %2F)
  {
    kind: "edit",
    file: INSTALL,
    find: "/opencode-ai/${InstallationChannel}",
    replace: "/{{npmPackageEncoded}}/${InstallationChannel}",
    count: 1,
  },

  // 14. `opencode upgrade` via npm / pnpm / bun installs our package
  {
    kind: "edit",
    file: INSTALL,
    find: "opencode-ai@${target}",
    replace: "{{npmPackage}}@${target}",
    count: 3,
  },

  // 15. Curl-install fallback checks our release repo
  {
    kind: "edit",
    file: INSTALL,
    find: "https://api.github.com/repos/anomalyco/opencode/releases/latest",
    replace: "https://api.github.com/repos/{{releaseRepo}}/releases/latest",
    count: 1,
  },
]

/** Every upstream file a transform touches, root-relative. */
export const UPSTREAM_FILES: string[] = [...new Set(TRANSFORMS.map((t) => t.file))]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `~/.bun/bin/bun test test/transforms.test.ts`
Expected: 7 pass, 0 fail. If an anchor test fails with a count mismatch, the fixture differs from what this plan recorded; read the fixture line with `grep -n` and correct the `find` string, do not loosen the count.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: transform list for v1.18.31 with upstream fixtures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Brand assets (logo and theme)

**Files:**
- Create: `brand/logo.ts`, `brand/theme.json`
- Test: `test/assets.test.ts`

**Interfaces:**
- Produces: `brand/logo.ts` exporting `logo: { left: string[]; right: string[] }`, `go: { left: string[]; right: string[] }`, `marks: string`, the same shape as upstream `packages/tui/src/logo.ts`. `brand/theme.json` with the same `theme` keys as the upstream fixture.

- [ ] **Step 1: Write the failing tests**

`test/assets.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `~/.bun/bin/bun test test/assets.test.ts`
Expected: FAIL, `Cannot find module "../brand/logo"`.

- [ ] **Step 3: Write brand/logo.ts**

```ts
// Drop-in replacement for upstream packages/tui/src/logo.ts.
// `left` is rendered in theme.primary, `right` in theme.text (see transform 3).
// Marks: "_" shadowed space, "^" shadowed ▀, "~" shadow-colored ▀, "," shadow-colored ▄.
export const logo = {
  left: ["     ", "▀▄ ▄▀", " ▄█▄ ", "▄▀ ▀▄"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

// Unchanged from upstream; used by the OpenCode Go dialog.
export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"
```

- [ ] **Step 4: Write brand/theme.json**

Copy the upstream fixture and replace only the `defs` block:

```bash
cd /Users/vinaykureel/Documents/xcode-overlay
cp test/fixtures/upstream/packages/tui/src/theme/assets/opencode.json brand/theme.json
```

Then replace the whole `"defs": { ... }` object in `brand/theme.json` with:

```json
  "defs": {
    "darkStep1": "#14171d",
    "darkStep2": "#1a1e26",
    "darkStep3": "#1f242d",
    "darkStep4": "#262c37",
    "darkStep5": "#2e3541",
    "darkStep6": "#373f4c",
    "darkStep7": "#434c5b",
    "darkStep8": "#5c6373",
    "darkStep9": "#b56fc7",
    "darkStep10": "#c98fd9",
    "darkStep11": "#8b93a3",
    "darkStep12": "#eeeeee",
    "darkSecondary": "#4de8f9",
    "darkAccent": "#c98fd9",
    "darkRed": "#e06c75",
    "darkOrange": "#f5a742",
    "darkGreen": "#7fd88f",
    "darkCyan": "#56b6c2",
    "darkYellow": "#e5c07b",
    "lightStep1": "#ffffff",
    "lightStep2": "#f9f4fa",
    "lightStep3": "#f3ecf5",
    "lightStep4": "#eadced",
    "lightStep5": "#e0d4e3",
    "lightStep6": "#d2c9d6",
    "lightStep7": "#b8bcc4",
    "lightStep8": "#9a9fa8",
    "lightStep9": "#7d2b8c",
    "lightStep10": "#51115c",
    "lightStep11": "#4f5766",
    "lightStep12": "#1f242d",
    "lightSecondary": "#1863dc",
    "lightAccent": "#51115c",
    "lightRed": "#d1383d",
    "lightOrange": "#d68c27",
    "lightGreen": "#3d9a57",
    "lightCyan": "#318795",
    "lightYellow": "#b0851f"
  },
```

Leave `"$schema"` and the entire `"theme"` object exactly as upstream has them. Verify it is still valid JSON:

```bash
~/.bun/bin/bun -e 'JSON.parse(require("fs").readFileSync("brand/theme.json","utf8")); console.log("ok")'
```
Expected: `ok`.

- [ ] **Step 5: Run the asset tests and the full suite**

Run: `~/.bun/bin/bun test`
Expected: all tests pass, including `test/transforms.test.ts` now running against the real `brand/` directory.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: XCode logo glyphs and SimplifyX theme

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: npm packaging

**Files:**
- Create: `src/package.ts`
- Test: `test/package.test.ts`

**Interfaces:**
- Consumes: `Brand` from `src/brand.ts`; `countOccurrences`, `TransformError` from `src/rebrand.ts`.
- Produces:
  ```ts
  interface PlatformPackage { dir: string; name: string; version: string }
  function scopedName(upstreamName: string, brand: Brand): string            // "opencode-darwin-arm64" -> "@simplifyx/xcode-darwin-arm64"
  function rebrandPlatformPackages(dist: string, brand: Brand, upstreamRoot: string): PlatformPackage[]
  function metaPackageJson(brand: Brand, version: string, platforms: PlatformPackage[], deps?: Record<string,string>): object
  const POSTINSTALL_ANCHOR: string
  function rebrandPostinstall(source: string, brand: Brand): string
  function placeholderBin(brand: Brand): string
  interface MetaOptions { fileDeps?: Record<string,string>; outDirName?: string }
  function writeMetaPackage(dist: string, brand: Brand, version: string, platforms: PlatformPackage[], upstreamRoot: string, opts?: MetaOptions): string  // returns meta dir
  async function packDir(dir: string, outDir: string): Promise<string>    // returns tarball path
  function binaryName(): string                                            // "opencode.exe" on win32, else "opencode"
  function hostPackage(platforms: PlatformPackage[]): PlatformPackage      // the non-baseline, non-musl package for this machine
  ```

- [ ] **Step 1: Write the failing tests**

`test/package.test.ts`:
```ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadBrand } from "../src/brand"
import { TransformError } from "../src/rebrand"
import {
  hostPackage,
  metaPackageJson,
  packDir,
  placeholderBin,
  rebrandPlatformPackages,
  rebrandPostinstall,
  scopedName,
  writeMetaPackage,
  type PlatformPackage,
} from "../src/package"

const FIXTURES = path.join(import.meta.dir, "fixtures/upstream")
const brand = loadBrand()

let upstreamRoot: string
let dist: string

function fakePlatform(name: string) {
  const dir = path.join(dist, name)
  mkdirSync(path.join(dir, "bin"), { recursive: true })
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.18.31", preferUnplugged: true, os: ["darwin"], cpu: ["arm64"] }, null, 2))
  writeFileSync(path.join(dir, "bin/opencode"), "#!/bin/sh\necho 1.18.31\n")
}

beforeEach(() => {
  upstreamRoot = mkdtempSync(path.join(tmpdir(), "xcode-upstream-"))
  mkdirSync(path.join(upstreamRoot, "packages/opencode/script"), { recursive: true })
  writeFileSync(path.join(upstreamRoot, "LICENSE"), "MIT License\n\nCopyright (c) upstream\n")
  copyFileSync(path.join(FIXTURES, "packages/opencode/script/postinstall.mjs"), path.join(upstreamRoot, "packages/opencode/script/postinstall.mjs"))
  dist = path.join(upstreamRoot, "packages/opencode/dist")
  fakePlatform("opencode-darwin-arm64")
  fakePlatform("opencode-linux-x64-baseline-musl")
})

afterEach(() => rmSync(upstreamRoot, { recursive: true, force: true }))

describe("scopedName", () => {
  test("keeps the platform suffix", () => {
    expect(scopedName("opencode-darwin-arm64", brand)).toBe("@simplifyx/xcode-darwin-arm64")
    expect(scopedName("opencode-linux-x64-baseline-musl", brand)).toBe("@simplifyx/xcode-linux-x64-baseline-musl")
  })
  test("rejects unexpected names", () => {
    expect(() => scopedName("something-else", brand)).toThrow("unexpected platform package name")
  })
})

describe("rebrandPlatformPackages", () => {
  test("renames, adds LICENSE, and is idempotent", () => {
    const first = rebrandPlatformPackages(dist, brand, upstreamRoot)
    expect(first.map((p) => p.name).sort()).toEqual(["@simplifyx/xcode-darwin-arm64", "@simplifyx/xcode-linux-x64-baseline-musl"])
    expect(first.every((p) => p.version === "1.18.31")).toBe(true)
    const pkg = JSON.parse(readFileSync(path.join(dist, "opencode-darwin-arm64/package.json"), "utf8"))
    expect(pkg.name).toBe("@simplifyx/xcode-darwin-arm64")
    expect(pkg.os).toEqual(["darwin"])
    expect(existsSync(path.join(dist, "opencode-darwin-arm64/LICENSE"))).toBe(true)
    const second = rebrandPlatformPackages(dist, brand, upstreamRoot)
    expect(second.map((p) => p.name).sort()).toEqual(first.map((p) => p.name).sort())
  })
})

describe("metaPackageJson", () => {
  const platforms: PlatformPackage[] = [
    { dir: "x", name: "@simplifyx/xcode-darwin-arm64", version: "1.18.31" },
    { dir: "y", name: "@simplifyx/xcode-linux-x64", version: "1.18.31" },
  ]
  test("mirrors upstream's meta package shape with scoped names", () => {
    const json = metaPackageJson(brand, "1.18.31", platforms) as any
    expect(json.name).toBe("@simplifyx/xcode")
    expect(json.version).toBe("1.18.31")
    expect(json.bin).toEqual({ opencode: "./bin/opencode.exe" })
    expect(json.scripts).toEqual({ postinstall: "node ./postinstall.mjs" })
    expect(json.license).toBe("MIT")
    expect(json.optionalDependencies).toEqual({
      "@simplifyx/xcode-darwin-arm64": "1.18.31",
      "@simplifyx/xcode-linux-x64": "1.18.31",
    })
  })
  test("accepts file: overrides for local installs", () => {
    const json = metaPackageJson(brand, "1.18.31", platforms, { "@simplifyx/xcode-darwin-arm64": "file:/tmp/x.tgz" }) as any
    expect(json.optionalDependencies["@simplifyx/xcode-darwin-arm64"]).toBe("file:/tmp/x.tgz")
    expect(json.optionalDependencies["@simplifyx/xcode-linux-x64"]).toBe("1.18.31")
  })
})

describe("rebrandPostinstall", () => {
  test("repoints the platform package prefix", () => {
    const source = readFileSync(path.join(FIXTURES, "packages/opencode/script/postinstall.mjs"), "utf8")
    const out = rebrandPostinstall(source, brand)
    expect(out).toContain("const base = `@simplifyx/xcode-${platform}-${arch}`")
    expect(out).not.toContain("const base = `opencode-${platform}-${arch}`")
    // the binary file names inside the platform packages are unchanged
    expect(out).toContain('const sourceBinary = platform === "windows" ? "opencode.exe" : "opencode"')
  })
  test("fails loudly on drift", () => {
    expect(() => rebrandPostinstall("nothing here", brand)).toThrow(TransformError)
  })
})

describe("placeholderBin", () => {
  test("names our package and exits 1", () => {
    const script = placeholderBin(brand)
    expect(script.startsWith("#!/bin/sh\n")).toBe(true)
    expect(script).toContain("@simplifyx/xcode")
    expect(script.trim().endsWith("exit 1")).toBe(true)
  })
})

describe("writeMetaPackage", () => {
  test("writes a complete, packable meta package", async () => {
    const platforms = rebrandPlatformPackages(dist, brand, upstreamRoot)
    const metaDir = writeMetaPackage(dist, brand, "1.18.31", platforms, upstreamRoot)
    expect(path.basename(metaDir)).toBe("meta")
    for (const f of ["package.json", "postinstall.mjs", "LICENSE", "bin/opencode.exe"]) {
      expect(existsSync(path.join(metaDir, f))).toBe(true)
    }
    expect(statSync(path.join(metaDir, "bin/opencode.exe")).mode & 0o111).not.toBe(0)
    const json = JSON.parse(readFileSync(path.join(metaDir, "package.json"), "utf8"))
    expect(Object.keys(json.optionalDependencies)).toHaveLength(2)

    const out = mkdtempSync(path.join(tmpdir(), "xcode-pack-"))
    const tgz = await packDir(metaDir, out)
    expect(tgz.endsWith(".tgz")).toBe(true)
    expect(path.basename(tgz)).toBe("simplifyx-xcode-1.18.31.tgz")
    rmSync(out, { recursive: true, force: true })
  })
})

describe("hostPackage", () => {
  test("prefers the plain package for this machine", () => {
    const os = process.platform === "win32" ? "windows" : process.platform
    const arch = process.arch
    const platforms: PlatformPackage[] = [
      { dir: "a", name: `@simplifyx/xcode-${os}-${arch}-baseline`, version: "1" },
      { dir: "b", name: `@simplifyx/xcode-${os}-${arch}`, version: "1" },
      { dir: "c", name: "@simplifyx/xcode-linux-arm64-musl", version: "1" },
    ]
    expect(hostPackage(platforms).dir).toBe("b")
  })
  test("throws when this machine has no package", () => {
    expect(() => hostPackage([{ dir: "c", name: "@simplifyx/xcode-nowhere-x", version: "1" }])).toThrow("no platform package for")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `~/.bun/bin/bun test test/package.test.ts`
Expected: FAIL, `Cannot find module "../src/package"`.

- [ ] **Step 3: Implement src/package.ts**

```ts
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { $ } from "bun"
import type { Brand } from "./brand"
import { countOccurrences, TransformError } from "./rebrand"

export interface PlatformPackage {
  dir: string
  name: string
  version: string
}

const UPSTREAM_PREFIX = "opencode-"

export function scopedName(upstreamName: string, brand: Brand): string {
  if (!upstreamName.startsWith(UPSTREAM_PREFIX)) throw new Error(`unexpected platform package name: ${upstreamName}`)
  return brand.npmPackage + upstreamName.slice(UPSTREAM_PREFIX.length - 1) // keep the leading "-"
}

export function binaryName(): string {
  return process.platform === "win32" ? "opencode.exe" : "opencode"
}

/**
 * Rename every upstream platform folder's package.json to the scoped name and
 * drop the MIT LICENSE in. Safe to run twice: already-scoped packages are kept,
 * the meta package folder is skipped.
 */
export function rebrandPlatformPackages(dist: string, brand: Brand, upstreamRoot: string): PlatformPackage[] {
  const result: PlatformPackage[] = []
  for (const entry of readdirSync(dist, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(dist, entry.name)
    const file = path.join(dir, "package.json")
    if (!existsSync(file)) continue
    const pkg = JSON.parse(readFileSync(file, "utf8")) as { name: string; version: string }
    if (pkg.name === brand.npmPackage) continue
    if (pkg.name.startsWith(UPSTREAM_PREFIX)) {
      pkg.name = scopedName(pkg.name, brand)
      writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
    } else if (!pkg.name.startsWith(`${brand.npmPackage}-`)) {
      continue
    }
    copyFileSync(path.join(upstreamRoot, "LICENSE"), path.join(dir, "LICENSE"))
    result.push({ dir, name: pkg.name, version: pkg.version })
  }
  return result
}

export function metaPackageJson(
  brand: Brand,
  version: string,
  platforms: PlatformPackage[],
  deps: Record<string, string> = {},
) {
  const optionalDependencies: Record<string, string> = {}
  for (const p of platforms) optionalDependencies[p.name] = deps[p.name] ?? p.version
  return {
    name: brand.npmPackage,
    version,
    description: `${brand.productName} ${brand.tagline}. OpenCode with SimplifyX branding.`,
    license: "MIT",
    bin: { opencode: "./bin/opencode.exe" },
    scripts: { postinstall: "node ./postinstall.mjs" },
    os: ["darwin", "linux", "win32"],
    cpu: ["arm64", "x64"],
    optionalDependencies,
  }
}

export const POSTINSTALL_ANCHOR = "const base = `opencode-${platform}-${arch}`"

export function rebrandPostinstall(source: string, brand: Brand): string {
  const actual = countOccurrences(source, POSTINSTALL_ANCHOR)
  if (actual !== 1) throw new TransformError("packages/opencode/script/postinstall.mjs", POSTINSTALL_ANCHOR, 1, actual)
  return source.replace(POSTINSTALL_ANCHOR, "const base = `" + brand.npmPackage + "-${platform}-${arch}`")
}

/** Replaced by the real binary when postinstall runs; explains itself otherwise. */
export function placeholderBin(brand: Brand): string {
  return [
    "#!/bin/sh",
    `echo "Error: ${brand.npmPackage}'s postinstall script was not run." >&2`,
    'echo "This happens with --ignore-scripts, or with package managers that skip postinstall (pnpm)." >&2',
    `echo "Fix: cd node_modules/${brand.npmPackage} && node postinstall.mjs" >&2`,
    "exit 1",
    "",
  ].join("\n")
}

export interface MetaOptions {
  /** optionalDependencies overrides, e.g. { "@simplifyx/xcode-darwin-arm64": "file:/abs/path.tgz" } */
  fileDeps?: Record<string, string>
  /** folder name under dist/, default "meta" */
  outDirName?: string
}

export function writeMetaPackage(
  dist: string,
  brand: Brand,
  version: string,
  platforms: PlatformPackage[],
  upstreamRoot: string,
  opts: MetaOptions = {},
): string {
  const dir = path.join(dist, opts.outDirName ?? "meta")
  mkdirSync(path.join(dir, "bin"), { recursive: true })
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(metaPackageJson(brand, version, platforms, opts.fileDeps), null, 2) + "\n")
  const postinstall = readFileSync(path.join(upstreamRoot, "packages/opencode/script/postinstall.mjs"), "utf8")
  writeFileSync(path.join(dir, "postinstall.mjs"), rebrandPostinstall(postinstall, brand))
  copyFileSync(path.join(upstreamRoot, "LICENSE"), path.join(dir, "LICENSE"))
  const bin = path.join(dir, "bin", "opencode.exe")
  writeFileSync(bin, placeholderBin(brand))
  chmodSync(bin, 0o755)
  return dir
}

/** `npm pack` one package directory into outDir; returns the tarball path. */
export async function packDir(dir: string, outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true })
  if (process.platform !== "win32") await $`chmod -R 755 ${path.join(dir, "bin")}`.quiet()
  const out = await $`npm pack --pack-destination ${outDir} --json`.cwd(dir).quiet().text()
  const [info] = JSON.parse(out) as { filename: string }[]
  return path.join(outDir, info.filename)
}

/** The plain (non-baseline, non-musl) package matching this machine. */
export function hostPackage(platforms: PlatformPackage[]): PlatformPackage {
  const os = process.platform === "win32" ? "windows" : process.platform
  const suffix = `-${os}-${process.arch}`
  const match = platforms.find((p) => p.name.endsWith(suffix))
  if (!match) throw new Error(`no platform package for ${os}-${process.arch} in: ${platforms.map((p) => p.name).join(", ")}`)
  return match
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `~/.bun/bin/bun test test/package.test.ts`
Expected: 11 pass, 0 fail. The `writeMetaPackage` test shells out to `npm pack`; if `npm` is not on the test's `PATH`, run with `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: scoped npm packaging mirroring upstream's meta package

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Pipeline `--local` and the first real build (milestone 1)

**Files:**
- Create: `src/pipeline.ts`
- Test: `test/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 to 5.
- Produces (exported for tests and Task 7):
  ```ts
  const EXIT: { drift: 2; toolchain: 3; build: 4; smoke: 5; publish: 6 }
  class PipelineError extends Error { code: number }
  interface Args { mode: "local" | "release" | "check"; version?: string; skipWebUi: boolean }
  function parseArgs(argv: string[]): Args
  function checkBunVersion(upstreamRoot: string, actual?: string): string
  function newerVersions(upstream: string[], current: string | undefined): string[]
  async function smokeTest(binary: string, version: string, brand: Brand): Promise<void>
  async function prepare(brand: Brand, version: string, opts: { single: boolean; skipWebUi: boolean }): Promise<{ upstreamRoot: string; distDir: string }>
  async function local(brand: Brand, version: string, skipWebUi: boolean): Promise<void>
  ```
  `--release` and `--check` are stubs in this task that throw `PipelineError("not implemented", 1)`; Task 7 fills them in.

- [ ] **Step 1: Write the failing tests (pure functions only)**

`test/pipeline.test.ts`:
```ts
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
  test("rejects a missing mode", () => {
    expect(() => parseArgs(["--version", "1.0.0"])).toThrow("usage:")
  })
  test("rejects a malformed version", () => {
    expect(() => parseArgs(["--local", "--version", "v1.18"])).toThrow("version must look like")
  })
})

describe("checkBunVersion", () => {
  const withPackageManager = (pm: string | undefined) => {
    const dir = mkdtempSync(path.join(tmpdir(), "xcode-bun-"))
    writeFileSync(path.join(dir, "package.json"), JSON.stringify(pm ? { packageManager: pm } : {}))
    return dir
  }
  test("accepts matching major.minor", () => {
    const dir = withPackageManager("bun@1.3.14")
    expect(checkBunVersion(dir, "1.3.20")).toBe("1.3.14")
    rmSync(dir, { recursive: true })
  })
  test("rejects a different minor with an install hint", () => {
    const dir = withPackageManager("bun@1.3.14")
    let error: unknown
    try {
      checkBunVersion(dir, "1.4.0")
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(PipelineError)
    expect((error as PipelineError).code).toBe(EXIT.toolchain)
    expect((error as PipelineError).message).toContain('bash -s "bun-v1.3.14"')
    rmSync(dir, { recursive: true })
  })
  test("rejects a missing packageManager field", () => {
    const dir = withPackageManager(undefined)
    expect(() => checkBunVersion(dir, "1.3.14")).toThrow("no packageManager")
    rmSync(dir, { recursive: true })
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `~/.bun/bin/bun test test/pipeline.test.ts`
Expected: FAIL, `Cannot find module "../src/pipeline"`.

- [ ] **Step 3: Implement src/pipeline.ts**

```ts
#!/usr/bin/env bun
import { appendFileSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { $ } from "bun"
import { BRAND_DIR, loadBrand, placeholders, type Brand } from "./brand"
import { applyTransforms, cloneUpstream, TransformError } from "./rebrand"
import { TRANSFORMS } from "./transforms"
import { binaryName, hostPackage, packDir, rebrandPlatformPackages, writeMetaPackage } from "./package"

export const EXIT = { drift: 2, toolchain: 3, build: 4, smoke: 5, publish: 6 } as const

const ROOT = path.resolve(import.meta.dir, "..")
const WORK = path.join(ROOT, "work")
const DIST = path.join(ROOT, "dist")
const VERSION_RE = /^\d+\.\d+\.\d+$/

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message)
    this.name = "PipelineError"
  }
}

export interface Args {
  mode: "local" | "release" | "check"
  version?: string
  skipWebUi: boolean
}

export function parseArgs(argv: string[]): Args {
  const mode = (["--local", "--release", "--check"] as const).find((m) => argv.includes(m))
  if (!mode) {
    throw new PipelineError("usage: bun run src/pipeline.ts --local|--release|--check [--version X.Y.Z] [--skip-web-ui]", 1)
  }
  const i = argv.indexOf("--version")
  const version = i >= 0 ? argv[i + 1] : undefined
  if (version !== undefined && !VERSION_RE.test(version)) {
    throw new PipelineError(`version must look like 1.18.31, got ${JSON.stringify(version)}`, 1)
  }
  return { mode: mode.slice(2) as Args["mode"], version, skipWebUi: argv.includes("--skip-web-ui") }
}

/** Upstream's scripts refuse to run unless Bun matches their packageManager pin. */
export function checkBunVersion(upstreamRoot: string, actual: string = Bun.version): string {
  const pkg = JSON.parse(readFileSync(path.join(upstreamRoot, "package.json"), "utf8")) as { packageManager?: string }
  const expected = pkg.packageManager?.split("@")[1]
  if (!expected) throw new PipelineError("upstream package.json has no packageManager field", EXIT.toolchain)
  const [emaj, emin] = expected.split(".")
  const [amaj, amin] = actual.split(".")
  if (emaj !== amaj || emin !== amin) {
    throw new PipelineError(
      `upstream needs bun ${expected} (major.minor must match), you have ${actual}.\n` +
        `Install it with: curl -fsSL https://bun.sh/install | bash -s "bun-v${expected}"`,
      EXIT.toolchain,
    )
  }
  return expected
}

/** Stable release versions from `upstream` that are newer than `current`, ascending. */
export function newerVersions(upstream: string[], current: string | undefined): string[] {
  return upstream
    .filter((v) => VERSION_RE.test(v))
    .filter((v) => current === undefined || Bun.semver.order(v, current) > 0)
    .sort(Bun.semver.order)
}

async function latestUpstreamVersion(brand: Brand): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${brand.upstreamRepo}/releases/latest`, {
    headers: { "user-agent": "xcode-overlay" },
  })
  if (!res.ok) throw new PipelineError(`GitHub API returned ${res.status} for ${brand.upstreamRepo}`, 1)
  const data = (await res.json()) as { tag_name: string }
  return data.tag_name.replace(/^v/, "")
}

/** Clone, verify Bun, install, transform, build. Shared by --local and --release. */
export async function prepare(
  brand: Brand,
  version: string,
  opts: { single: boolean; skipWebUi: boolean },
): Promise<{ upstreamRoot: string; distDir: string }> {
  console.log(`\n== ${brand.productName} ${version}: clone upstream ==`)
  const upstreamRoot = await cloneUpstream(brand.upstreamRepo, version, WORK)
  checkBunVersion(upstreamRoot)

  console.log("\n== bun install (upstream dependencies) ==")
  const install = await $`bun install`.cwd(upstreamRoot).nothrow()
  if (install.exitCode !== 0) throw new PipelineError(`upstream bun install failed (exit ${install.exitCode})`, EXIT.build)

  console.log("\n== apply brand transforms ==")
  try {
    const changed = applyTransforms(upstreamRoot, TRANSFORMS, placeholders(brand), BRAND_DIR)
    for (const f of changed) console.log(`  rebranded ${f}`)
  } catch (e) {
    if (e instanceof TransformError) throw new PipelineError(e.message, EXIT.drift)
    throw e
  }

  console.log("\n== upstream build ==")
  const flags = [opts.single ? "--single" : "", opts.skipWebUi ? "--skip-embed-web-ui" : ""].filter(Boolean)
  const build = await $`bun run ./script/build.ts ${flags}`
    .cwd(path.join(upstreamRoot, "packages/opencode"))
    .env({ ...process.env, OPENCODE_VERSION: version, OPENCODE_CHANNEL: "latest" })
    .nothrow()
  if (build.exitCode !== 0) throw new PipelineError(`upstream build failed (exit ${build.exitCode})`, EXIT.build)

  return { upstreamRoot, distDir: path.join(upstreamRoot, "packages/opencode/dist") }
}

/** `--version` must print the version; the binary must embed the brand strings. */
export async function smokeTest(binary: string, version: string, brand: Brand): Promise<void> {
  const out = await $`${binary} --version`.nothrow().text()
  if (!out.includes(version)) {
    throw new PipelineError(`smoke: ${binary} --version printed ${JSON.stringify(out.trim())}, expected ${version}`, EXIT.smoke)
  }
  const bytes = readFileSync(binary)
  for (const needle of [brand.productName, brand.tagline]) {
    if (!bytes.includes(needle)) throw new PipelineError(`smoke: binary does not contain ${JSON.stringify(needle)}`, EXIT.smoke)
  }
  console.log(`smoke test passed: ${out.trim()}, brand strings present`)
}

export async function local(brand: Brand, version: string, skipWebUi: boolean): Promise<void> {
  const { upstreamRoot, distDir } = await prepare(brand, version, { single: true, skipWebUi })
  const platforms = rebrandPlatformPackages(distDir, brand, upstreamRoot)
  const host = hostPackage(platforms)
  await smokeTest(path.join(host.dir, "bin", binaryName()), version, brand)

  console.log("\n== package for local install ==")
  const out = path.join(DIST, version, "local")
  rmSync(out, { recursive: true, force: true })
  const platformTgz = await packDir(host.dir, out)
  const metaDir = writeMetaPackage(distDir, brand, version, [host], upstreamRoot, {
    fileDeps: { [host.name]: `file:${platformTgz}` },
    outDirName: "meta-local",
  })
  const metaTgz = await packDir(metaDir, out)
  console.log(`  ${platformTgz}\n  ${metaTgz}`)

  console.log("\n== install globally ==")
  const stock = await $`npm ls -g opencode-ai --depth=0`.quiet().nothrow()
  if (stock.exitCode === 0) {
    console.log("  removing stock opencode-ai (reinstall later with: npm install -g opencode-ai)")
    await $`npm uninstall -g opencode-ai`
  }
  await $`npm install -g ${metaTgz}`
  const which = await $`which opencode`.nothrow().text()
  const ver = await $`opencode --version`.nothrow().text()
  console.log(`\n${brand.productName} ${brand.tagline} installed.\n  binary: ${which.trim()}\n  version: ${ver.trim()}\n\nRun \`opencode\` to see the home screen.`)
}

async function release(_brand: Brand, _version: string): Promise<void> {
  throw new PipelineError("--release is not implemented yet (Task 7)", 1)
}

async function check(_brand: Brand): Promise<void> {
  throw new PipelineError("--check is not implemented yet (Task 7)", 1)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const brand = loadBrand()
  if (args.mode === "check") return check(brand)
  const version = args.version ?? (await latestUpstreamVersion(brand))
  if (args.mode === "local") return local(brand, version, args.skipWebUi)
  return release(brand, version)
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    if (e instanceof PipelineError) {
      console.error(`\nerror: ${e.message}`)
      process.exit(e.code)
    }
    console.error(e)
    process.exit(1)
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `~/.bun/bin/bun test`
Expected: all suites pass (brand, rebrand, transforms, assets, package, pipeline).

- [ ] **Step 5: Commit the pipeline before the long build**

```bash
git add -A && git commit -m "feat: pipeline --local mode with Bun check, build, smoke test, global install

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Run the first real local build (milestone 1)**

This clones upstream, runs `bun install` on a large monorepo, and compiles a native binary. Expect 10 to 25 minutes on first run and a few GB under `work/`. Run in a shell where both Bun and npm are on `PATH`:

```bash
cd /Users/vinaykureel/Documents/xcode-overlay && export PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" && bun run src/pipeline.ts --local --version 1.18.31 2>&1 | tee work/local-1.18.31.log
```

Expected tail of output:
```
smoke test passed: 1.18.31, brand strings present
...
XCode by SimplifyX installed.
  binary: /Users/vinaykureel/.nvm/versions/node/v20.20.2/bin/opencode
  version: 1.18.31
```

If it fails:
- exit 2: an anchor drifted; the message names the file and string. Fix `src/transforms.ts` and the fixture, rerun.
- exit 3: Bun mismatch; message contains the install command.
- exit 4 during `bun install` or `build.ts`: read `work/local-1.18.31.log`. A common cause is the embedded web UI build needing extra tooling; retry with `--skip-web-ui` to confirm the rest works, then fix the web UI build separately.
- `npm install -g` fails on `file:` resolution: fall back to installing both tarballs in one command, `npm install -g <meta.tgz> <platform.tgz>`; sibling global packages resolve through Node's parent-directory lookup, so postinstall still finds the binary. If that is needed, change `local()` to do it and remove the `fileDeps` option from the local meta package.
- `npm install -g` fails with `EEXIST` on the `opencode` bin: the stock package was not detected; run `npm uninstall -g opencode-ai` manually and rerun.

- [ ] **Step 7: Verify the branding by eye**

Open a new terminal tab (so the shell picks up PATH changes) and run:

```bash
opencode
```

Check: home screen shows the X in purple and "Code" beside it, "by SimplifyX" underneath, purple highlights on selection, the terminal tab title reads "XCode". Press `Ctrl+C` or type `/exit` to quit. Then:

```bash
opencode upgrade
```
Expected: it reports checking for `@simplifyx/xcode` and fails to find it (no registry yet). That failure is correct for this phase.

If the X glyph looks wrong at your terminal font, edit `brand/logo.ts` (keep four rows, uniform width, only `█ ▀ ▄` space and the four marks), rerun `bun test`, then rerun the `--local` command. The second run is much faster: the clone and `node_modules` are reused.

- [ ] **Step 8: Commit any glyph tuning**

```bash
git add -A && git commit -m "feat: tune XCode logo glyph after first local build

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(Skip if nothing changed.)

---

### Task 7: `--check`, `--release`, CI wrapper, README (milestone 2)

**Files:**
- Modify: `src/pipeline.ts` (replace the `release` and `check` stubs)
- Create: `.github/workflows/rebrand.yml`, `README.md`

**Interfaces:**
- Consumes: `prepare`, `smokeTest`, `newerVersions`, `PipelineError`, `EXIT` from `src/pipeline.ts`; `rebrandPlatformPackages`, `writeMetaPackage`, `packDir`, `hostPackage`, `binaryName` from `src/package.ts`.
- Produces: `--check` prints newer versions one per line (or `up to date`) and, when `GITHUB_OUTPUT` is set, appends `versions=<JSON array>`. `--release --version X` publishes all packages and creates a GitHub release. Optional `script/sign.ts` hook, executed if present with the dist directory as its only argument.

`--release` cannot be exercised end to end without the internal registry and the release repo. Its pure helper `newerVersions` is tested in Task 6; the shell steps mirror upstream's own publish script and are verified on the first CI run.

- [ ] **Step 1: Replace the stubs in src/pipeline.ts**

Replace the two stub functions with:

```ts
async function registryLatest(brand: Brand): Promise<string | undefined> {
  const r = await $`npm view ${brand.npmPackage} version`.quiet().nothrow()
  return r.exitCode === 0 ? r.text().trim() : undefined
}

async function upstreamReleaseVersions(brand: Brand): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${brand.upstreamRepo}/releases?per_page=30`, {
    headers: { "user-agent": "xcode-overlay" },
  })
  if (!res.ok) throw new PipelineError(`GitHub API returned ${res.status} for ${brand.upstreamRepo}`, 1)
  const data = (await res.json()) as { tag_name: string; draft: boolean; prerelease: boolean }[]
  return data.filter((r) => !r.draft && !r.prerelease).map((r) => r.tag_name.replace(/^v/, ""))
}

async function check(brand: Brand): Promise<void> {
  const [upstream, current] = await Promise.all([upstreamReleaseVersions(brand), registryLatest(brand)])
  const newer = newerVersions(upstream, current)
  console.log(newer.length ? newer.join("\n") : "up to date")
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `versions=${JSON.stringify(newer)}\n`)
  }
}

async function signHook(distDir: string): Promise<void> {
  const hook = path.join(ROOT, "script", "sign.ts")
  if (!(await Bun.file(hook).exists())) return
  console.log("\n== sign hook ==")
  const r = await $`bun run ${hook} ${distDir}`.nothrow()
  if (r.exitCode !== 0) throw new PipelineError(`sign hook failed (exit ${r.exitCode})`, EXIT.build)
}

async function archiveBinaries(platforms: { dir: string; name: string }[], outDir: string): Promise<string[]> {
  const files: string[] = []
  for (const p of platforms) {
    const base = p.name.split("/").pop()!
    const bin = path.join(p.dir, "bin")
    if (base.includes("linux")) {
      const file = path.join(outDir, `${base}.tar.gz`)
      await $`tar -czf ${file} -C ${bin} .`
      files.push(file)
    } else {
      const file = path.join(outDir, `${base}.zip`)
      await $`zip -qr ${file} .`.cwd(bin)
      files.push(file)
    }
  }
  return files
}

async function release(brand: Brand, version: string): Promise<void> {
  const { upstreamRoot, distDir } = await prepare(brand, version, { single: false, skipWebUi: false })
  const platforms = rebrandPlatformPackages(distDir, brand, upstreamRoot)
  await smokeTest(path.join(hostPackage(platforms).dir, "bin", binaryName()), version, brand)
  await signHook(distDir)

  console.log("\n== package ==")
  const out = path.join(DIST, version, "release")
  rmSync(out, { recursive: true, force: true })
  const metaDir = writeMetaPackage(distDir, brand, version, platforms, upstreamRoot)
  const toPublish: { name: string; version: string; tgz: string }[] = []
  for (const p of platforms) toPublish.push({ name: p.name, version: p.version, tgz: await packDir(p.dir, out) })
  toPublish.push({ name: brand.npmPackage, version, tgz: await packDir(metaDir, out) }) // meta last

  console.log("\n== publish ==")
  const failed: string[] = []
  for (const t of toPublish) {
    const exists = (await $`npm view ${t.name}@${t.version} version`.quiet().nothrow()).exitCode === 0
    if (exists) {
      console.log(`  already published ${t.name}@${t.version}`)
      continue
    }
    const r = await $`npm publish ${t.tgz}`.nothrow()
    if (r.exitCode !== 0) failed.push(t.name)
    else console.log(`  published ${t.name}@${t.version}`)
  }

  console.log("\n== github release ==")
  const archives = await archiveBinaries(platforms, out)
  const tag = `v${version}`
  const exists = (await $`gh release view ${tag} --repo ${brand.releaseRepo}`.quiet().nothrow()).exitCode === 0
  const notes = `${brand.productName} ${brand.tagline}, rebranded from https://github.com/${brand.upstreamRepo}/releases/tag/${tag}`
  if (!exists) {
    await $`gh release create ${tag} --repo ${brand.releaseRepo} --title ${`${brand.productName} ${tag}`} --notes ${notes} ${archives}`
  } else {
    await $`gh release upload ${tag} --repo ${brand.releaseRepo} --clobber ${archives}`
  }

  if (failed.length) throw new PipelineError(`publish failed for: ${failed.join(", ")}. Rerun to publish the rest.`, EXIT.publish)
  console.log(`\n${brand.productName} ${version} released.`)
}
```

- [ ] **Step 2: Run the suite and a dry `--check`**

Run: `~/.bun/bin/bun test`
Expected: all pass.

Run: `cd /Users/vinaykureel/Documents/xcode-overlay && PATH="$HOME/.bun/bin:$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" bun run src/pipeline.ts --check`
Expected: a list of upstream versions (since `@simplifyx/xcode` is not on any registry, `npm view` fails and every stable upstream release in the last 30 is listed, ascending). The list must include `1.18.31`.

- [ ] **Step 3: Write the CI wrapper**

`.github/workflows/rebrand.yml`:
```yaml
name: rebrand

on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:
    inputs:
      version:
        description: "Upstream version to rebrand (e.g. 1.18.31). Leave empty to publish every newer upstream release."
        required: false
        type: string

permissions:
  contents: write

env:
  # Internal registry, e.g. https://artifactory.simplifyx.com/artifactory/api/npm/npm-local/
  NPM_REGISTRY_URL: ${{ secrets.NPM_REGISTRY_URL }}
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
  GH_TOKEN: ${{ secrets.RELEASE_REPO_TOKEN }}

jobs:
  check:
    runs-on: ubuntu-latest
    outputs:
      versions: ${{ steps.check.outputs.versions }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: .bun-version
      - name: Configure npm registry
        run: |
          host="${NPM_REGISTRY_URL#https://}"
          printf 'registry=%s\n//%s:_authToken=%s\n' "$NPM_REGISTRY_URL" "$host" "$NPM_TOKEN" > ~/.npmrc
      - run: bun install
      - id: check
        run: |
          if [ -n "${{ inputs.version }}" ]; then
            echo 'versions=["${{ inputs.version }}"]' >> "$GITHUB_OUTPUT"
          else
            bun run src/pipeline.ts --check
          fi

  release:
    needs: check
    if: needs.check.outputs.versions != '[]' && needs.check.outputs.versions != ''
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        version: ${{ fromJson(needs.check.outputs.versions) }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: .bun-version
      - name: Configure npm registry
        run: |
          host="${NPM_REGISTRY_URL#https://}"
          printf 'registry=%s\n//%s:_authToken=%s\n' "$NPM_REGISTRY_URL" "$host" "$NPM_TOKEN" > ~/.npmrc
      - run: bun install
      - run: bun test
      - run: bun run src/pipeline.ts --release --version ${{ matrix.version }}
```

Notes for whoever wires the secrets: `NPM_REGISTRY_URL` must end with `/`; `NPM_TOKEN` is a publish token for that registry; `RELEASE_REPO_TOKEN` needs `contents: write` on the repo named in `brand.json` `releaseRepo`. The `check` job also needs read access to that registry so `npm view` can find the current version. `.bun-version` must be bumped when upstream bumps `packageManager`; the pipeline's Bun check fails with the exact version otherwise.

- [ ] **Step 4: Write README.md**

```markdown
# xcode-overlay

Builds **XCode by SimplifyX**: [OpenCode](https://github.com/anomalyco/opencode) with SimplifyX colors, logo, and name. No fork. This repo holds only brand assets and a pipeline that clones an upstream tag, applies fifteen small, asserted edits, builds it with upstream's own build script, and packages it as `@simplifyx/xcode`.

Design: `docs/superpowers/specs/2026-09-17-xcode-rebrand-overlay-design.md`

## For developers

```bash
npm install -g @simplifyx/xcode --registry <internal registry URL>
opencode
```

The command is `opencode`, the config directory is `~/.config/opencode`, and all upstream docs apply. `opencode upgrade` pulls from the internal registry.

## For maintainers

Prerequisites: Bun matching upstream's `packageManager` (see `.bun-version`), Node 20+, git. Release mode also needs `gh` and an `~/.npmrc` pointing at the internal registry.

```bash
bun install
bun test                                            # offline unit tests
bun run src/pipeline.ts --check                     # upstream versions not yet published
bun run src/pipeline.ts --local --version 1.18.31   # build + install on this machine
bun run src/pipeline.ts --release --version 1.18.31 # build all targets, publish, GitHub release
```

Add `--skip-web-ui` to `--local` for a faster build without the embedded web UI.

### When a run fails with "anchor drift"

Upstream changed one of the eight files we edit. The message names the file and the exact string.

1. Open the upstream diff for that file between the last good tag and the failing one.
2. Update the `find` (and if needed `replace`) string in `src/transforms.ts`. Keep the `count` honest.
3. Refresh the fixture: copy the file from the failing tag into `test/fixtures/upstream/...`.
4. `bun test`, commit, rerun the pipeline.

### When upstream bumps Bun

Update `.bun-version` and `packageManager` in `package.json` to the new version, install it locally, rerun.

### Changing the brand

Edit `brand/brand.json`, `brand/theme.json`, or `brand/logo.ts`. Run `bun test`. Nothing in `src/` needs to change.

### Files we edit upstream

- `packages/tui/src/logo.ts` (replaced)
- `packages/tui/src/theme/assets/opencode.json` (replaced)
- `packages/tui/src/component/logo.tsx`
- `packages/tui/src/app.tsx`
- `packages/tui/src/attention.ts`
- `packages/tui/src/feature-plugins/home/tips-view.tsx`
- `packages/tui/src/routes/session/permission.tsx`
- `packages/opencode/src/installation/index.ts`

Strings naming the third-party services "OpenCode Zen" and "OpenCode Go" are intentionally left as they are.

## License

OpenCode is MIT licensed. Every package this pipeline publishes includes upstream's `LICENSE`.
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: --check and --release modes, CI wrapper, maintainer README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec

**Spec coverage.**
- §1 goals and non-goals: command unchanged (transforms never touch `.scriptName`, config dir, env vars); no desktop app work; signing left as the `script/sign.ts` hook (Task 7). ✔
- §2 brand inputs: `brand/brand.json` (Task 1), palette in `brand/theme.json` (Task 4). ✔
- §3 layout: matches Tasks 1 to 7; `src/rebrand.ts` holds the engine plus `cloneUpstream`, as the spec lists. ✔
- §4 engine: two kinds, exact counts, all-or-nothing (Task 2); fifteen transforms in spec order with the same anchors (Task 3); Zen/Go strings untouched and tested. ✔
- §5 logo and theme: Task 4, tested for shape, allowed characters, upstream `right` glyphs, theme key parity, palette values. ✔
- §6 packaging: scoped names, meta package mirroring upstream, postinstall edit, LICENSE in every package, `npm pack` (Task 5). ✔
- §7 pipeline: prerequisites check (Bun major.minor), `--check`, `--local` with `file:` deps and `--skip-web-ui`, `--release` with idempotent publish, GitHub release fallback, sign hook, exit codes 2 to 6 (Tasks 6 and 7). CI wrapper (Task 7). ✔
- §8 testing: unit tests per module, drift test, smoke test in both build modes, acceptance in Task 6 Steps 6 and 7. ✔
- §9 maintenance: README runbook (Task 7). ✔

**Placeholder scan.** No TBD/TODO. Every code step has full code. `releaseRepo` is a declared placeholder value in the spec, carried as data.

**Type consistency.** `PlatformPackage`, `Brand`, `Transform`, `TransformError`, `PipelineError`, `EXIT`, `hostPackage`, `binaryName`, `packDir`, `writeMetaPackage(dist, brand, version, platforms, upstreamRoot, opts)` are used with the same names and argument order in Tasks 5, 6, and 7. `placeholders()` keys match the `{{...}}` names used in `src/transforms.ts`.

**Known risk, called out in Task 6 Step 6:** `npm install -g` of a tarball whose optional dependency is a `file:` path is the intended local-install mechanism; the fallback of installing both tarballs in one command is documented there in case npm rejects it.

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadBrand, placeholders, BRAND_DIR } from "../src/brand"
import { applyTransforms, countOccurrences, TransformError } from "../src/rebrand"
import { CONFIG_PATH_HELPERS, TRANSFORMS, UPSTREAM_FILES, UPSTREAM_RULES } from "../src/transforms"
import { fill } from "../src/brand"

const FIXTURES = path.join(import.meta.dir, "fixtures/upstream")
const brand = loadBrand()
const vars = placeholders(brand)

let root: string
let brandDir: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "simplify-code-upstream-"))
  cpSync(FIXTURES, root, { recursive: true })
  // Use the real brand/ dir when Task 4 has produced the assets, else stand-ins.
  if (existsSync(path.join(BRAND_DIR, "logo.ts")) && existsSync(path.join(BRAND_DIR, "theme.json"))) {
    brandDir = BRAND_DIR
  } else {
    brandDir = mkdtempSync(path.join(tmpdir(), "simplify-code-brand-"))
    writeFileSync(path.join(brandDir, "logo.ts"), "export const logo = { left: [], right: [] }\nexport const go = { left: [], right: [] }\nexport const marks = \"_^~,\"\n")
    writeFileSync(path.join(brandDir, "theme.json"), '{"defs":{},"theme":{}}\n')
  }
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  if (brandDir !== BRAND_DIR) rmSync(brandDir, { recursive: true, force: true })
})

const read = (rel: string) => readFileSync(path.join(root, rel), "utf8")

/**
 * The only "OpenCode" occurrences allowed to survive a full transform run, with
 * the reason each one stays. Everything else in the fixture tree must be gone.
 */
const KEPT_OPENCODE: { file: string; count: number; contains: string; reason: string }[] = [
  {
    file: "packages/tui/src/feature-plugins/home/tips-view.tsx",
    count: 1,
    contains: "OpenCode Zen",
    reason: "names the third-party model gateway, not the application",
  },
  {
    file: "packages/tui/src/logo.ts",
    count: 1,
    contains: "// Unchanged from upstream; used by the OpenCode Go dialog.",
    reason: "source comment in our own drop-in, naming the third-party OpenCode Go dialog; never rendered",
  },
  ...["en", "de", "fi"].map((locale) => ({
    file: `packages/app/src/i18n/${locale}.ts`,
    count: 1,
    contains: "OpenCode Zen",
    reason: "names the third-party model gateway, not the application",
  })),
  {
    file: "packages/ui/src/theme/context.tsx",
    count: 1,
    contains: 'opencode: "OpenCode"',
    reason: "theme-picker label for upstream's own classic theme, which is still called OpenCode",
  },
  {
    file: "packages/app/src/pages/layout/deep-links.ts",
    count: 2,
    contains: "type OpenCodeWindow",
    reason: "a TypeScript type name, never shown to anyone",
  },
  {
    file: "packages/desktop/electron-builder.config.ts",
    count: 5,
    contains: 'productName: "OpenCode Dev"',
    reason:
      "dev and beta channel names plus the base protocol name that prod overrides; we only ever build prod. The fifth is ours: the copyright line credits OpenCode's contributors, whose MIT-licensed code this is",
  },
  {
    file: "packages/desktop/src/main/index.ts",
    count: 3,
    contains: 'dev: "OpenCode Dev"',
    reason: "dev and beta channel app names; we only ever build prod",
  },
  {
    file: "packages/opencode/src/config/managed.ts",
    count: 1,
    contains: "not OpenCode config",
    reason: "upstream source comment about MDM payload keys; never rendered",
  },
]

/** The text of one CSS rule, from its selector line to its closing brace. */
function scopedBlock(css: string, selectorLine: string): string {
  const start = css.indexOf(selectorLine)
  expect(start).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf("\n}", start))
}

/**
 * Tailwind's --color-* aliases are resolved once at :root, so a theme token overridden for a
 * subtree only reaches the utility classes if its alias is re-declared in the same rule.
 * Returns how many tokens the block overrides.
 */
function expectEveryTokenAliased(block: string): number {
  const tokens = [...block.matchAll(/^\s*--((?:v2-)?[a-z0-9-]+):/gm)].map((m) => m[1]).filter((t) => !t.startsWith("color-") && !t.startsWith("brand-"))
  for (const token of tokens) expect(block).toContain(`--color-${token}: var(--${token});`)
  return tokens.length
}

describe("TRANSFORMS against v1.18.31 fixtures", () => {
  test("has one hundred and thirty-seven entries: seventy-six file targets and three rules", () => {
    expect(TRANSFORMS).toHaveLength(137)
    expect(UPSTREAM_FILES).toHaveLength(76)
    expect(UPSTREAM_RULES).toEqual([
      "packages/app/src/i18n/*.ts",
      "packages/desktop/src/renderer/i18n/*.ts",
      "packages/tui/src/feature-plugins/home/tips-view.tsx",
    ])
  })

  test("every anchor is found exactly as often as declared", () => {
    const written = applyTransforms(root, TRANSFORMS, vars, brandDir)
    // the rule rewrites whichever locale files exist; the fixture tree carries three of upstream's 63
    const locales = [
      ...["de", "en", "fi"].map((l) => `packages/app/src/i18n/${l}.ts`),
      ...["de", "en"].map((l) => `packages/desktop/src/renderer/i18n/${l}.ts`),
    ]
    expect(written.sort()).toEqual([...UPSTREAM_FILES, ...locales].sort())
  })

  test("removes app-facing OpenCode strings but keeps Zen/Go product names", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    expect(countOccurrences(read("packages/tui/src/app.tsx"), "OpenCode")).toBe(0)
    expect(countOccurrences(read("packages/tui/src/attention.ts"), "OpenCode")).toBe(0)
    expect(countOccurrences(read("packages/tui/src/routes/session/permission.tsx"), "OpenCode")).toBe(0)
    const tips = read("packages/tui/src/feature-plugins/home/tips-view.tsx")
    expect(countOccurrences(tips, "OpenCode")).toBe(1)
    expect(tips).toContain("OpenCode Zen")
    expect(tips).toContain("prevent Simplify Code from reading")
    expect(read("packages/tui/src/app.tsx")).toContain('setTerminalTitle("Simplify Code")')
    expect(read("packages/tui/src/app.tsx")).toContain("Successfully updated to Simplify Code v")
  })

  test("rebrands the cli/cmd copies of the same strings", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const uninstall = read("packages/opencode/src/cli/cmd/uninstall.ts")
    expect(uninstall).toContain('prompts.intro("Uninstall Simplify Code")')
    expect(uninstall).toContain("Thank you for using Simplify Code!")
    expect(read("packages/opencode/src/cli/cmd/run/splash.ts")).toContain('top, "Simplify Code", right')
    const perm = read("packages/opencode/src/cli/cmd/run/footer.permission.tsx")
    expect(countOccurrences(perm, "Tell Simplify Code what to do differently")).toBe(2)
    const shared = read("packages/opencode/src/cli/cmd/run/permission.shared.ts")
    expect(countOccurrences(shared, "until Simplify Code is restarted")).toBe(2)
    expect(read("packages/opencode/src/cli/cmd/run/footer.prompt.tsx")).toContain('description: "close Simplify Code"')
    expect(read("packages/tui/src/feature-plugins/sidebar/footer.tsx")).toContain("Simplify Code includes free models")
  })

  test("rebrands the graphical UI: theme, logo, page chrome, favicons and every locale", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const theme = JSON.parse(read("packages/ui/src/theme/themes/oc-2.json"))
    expect(theme.id).toBe("oc-2") // id unchanged so saved preferences keep working
    expect(theme.name).toBe("Simplify Code")
    expect(theme.light.palette.primary).toBe("#7d2b8c")
    expect(theme.light.v2Overrides["v2-background-bg-accent"]).toBe("#7d2b8cff")
    expect(theme.dark.v2Overrides["v2-text-text-accent"]).toBe("#c98fd9ff")
    expect(theme.light.v2Overrides["v2-green-600"]).toBe(
      JSON.parse(readFileSync(path.join(FIXTURES, "packages/ui/src/theme/themes/oc-2.json"), "utf8")).light.v2Overrides["v2-green-600"],
    ) // untouched upstream value survives

    expect(read("packages/ui/src/components/logo.tsx")).toBe(readFileSync(path.join(brandDir, "gui/logo.tsx"), "utf8"))
    expect(read("packages/ui/src/v2/components/wordmark-v2.tsx")).toContain("export function WordmarkV2")
    expect(read("packages/app/index.html")).toContain("<title>Simplify Code</title>")
    const manifest = JSON.parse(read("packages/ui/src/assets/favicon/site.webmanifest"))
    expect([manifest.name, manifest.short_name]).toEqual(["Simplify Code", "Simplify Code"])
    expect(read("packages/ui/src/components/favicon.tsx")).toContain('content="Simplify Code"')
    expect(read("packages/app/src/components/windows-app-menu.tsx")).toContain('desktop-app-menu-heading">Simplify Code<')
    expect(read("packages/ui/src/theme/context.tsx")).toContain('"oc-2": "Simplify Code"')

    const png = "packages/ui/src/assets/favicon/favicon-96x96-v3.png"
    expect(Buffer.compare(readFileSync(path.join(root, png)), readFileSync(path.join(brandDir, "gui/favicon/favicon-96x96-v3.png")))).toBe(0)

    expect(read("packages/app/src/i18n/en.ts")).toContain('"app.name.desktop": "Simplify Code Desktop"')
    expect(read("packages/app/src/i18n/en.ts")).toContain("OpenCode Zen gives you access")
    expect(countOccurrences(read("packages/app/src/i18n/fi.ts"), "Simplify Code")).toBe(42)
  })

  test("skins light mode with the simplifyx.com palette and makes light the default", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const light = JSON.parse(read("packages/ui/src/theme/themes/oc-2.json")).light
    const upstream = JSON.parse(readFileSync(path.join(FIXTURES, "packages/ui/src/theme/themes/oc-2.json"), "utf8"))
    // every surface, text, icon and border token resolves through this ramp
    expect(light.v2Overrides["v2-grey-50"]).toBe("#ffffffff") // cards stay white, like the site
    expect(light.v2Overrides["v2-grey-100"]).toBe("#f3eaf6ff") // canvas: a stronger take on the site's lavender tint
    expect(light.v2Overrides["v2-grey-200"]).toBe("#ede1f1ff") // the steps above it stay ordered, each deeper than the last
    expect(light.v2Overrides["v2-grey-300"]).toBe("#e6d8ebff")
    expect(light.v2Overrides["v2-grey-400"]).toBe("#d9c8dfff")
    expect(light.overrides["surface-base"]).toBe("#f3eaf6")
    expect(light.palette.neutral).toBe("#f3eaf6")
    expect(light.v2Overrides["v2-grey-700"]).toBe("#4f5766ff") // site --accent-gray
    expect(light.v2Overrides["v2-grey-1000"]).toBe("#1f242dff") // site --secondary (navy)
    expect(light.v2Overrides["v2-purple-600"]).toBe("#7d2b8cff") // site --accent
    expect(light.v2Overrides["v2-purple-800"]).toBe("#51115cff") // site CTA purple
    expect(light.overrides["text-strong"]).toBe("#1f242d")
    expect(light.overrides["text-base"]).toBe("#4f5766")
    expect(light.palette.ink).toBe("#1f242d")
    // tokens that point at the ramp are left pointing at it, and semantic colours are untouched
    expect(light.v2Overrides["v2-background-bg-deep"]).toBe("var(--v2-grey-100)")
    expect(light.v2Overrides["v2-red-600"]).toBe(upstream.light.v2Overrides["v2-red-600"])

    // no grey flash before the theme loads, in any of the three places the canvas colour is hard-coded
    const context = read("packages/ui/src/theme/context.tsx")
    expect(countOccurrences(context, ': "#f3eaf6"')).toBe(2)
    const preload = read("packages/app/public/oc-theme-preload.js")
    expect(countOccurrences(preload, ': "#f3eaf6"')).toBe(2)
    expect(read("packages/app/index.html")).toContain('name="theme-color" content="#f3eaf6"')
    for (const file of [context, preload]) {
      expect(file).not.toContain("#fafafa")
      expect(file).not.toContain("#faf6fb") // the earlier, paler canvas
    }

    // light unless the user chooses otherwise; the stored preference still wins
    expect(countOccurrences(context, '?? "light"')).toBe(2)
    expect(context).not.toContain('| null) ?? "system"')
    expect(preload).toContain('localStorage.getItem("opencode-color-scheme") || "light"')
  })

  test("puts a one-click light/dark toggle in both titlebar layouts, left of the lockup", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const titlebar = read("packages/app/src/components/titlebar.tsx")
    expect(countOccurrences(titlebar, "<BrandThemeToggle />")).toBe(2)
    for (const at of [...titlebar.matchAll(/<BrandThemeToggle \/>/g)].map((m) => m.index!)) {
      expect(titlebar.slice(at, at + 80)).toMatch(/^<BrandThemeToggle \/>\s*<BrandLockup \/>/)
    }
    const logo = read("packages/ui/src/components/logo.tsx")
    expect(logo).toContain("export const BrandThemeToggle")
    expect(logo).toContain('import { useTheme } from "../theme/context"')
    // a real <button>: upstream's base.css exempts buttons from the titlebar's window-drag region
    expect(logo).toContain('<button\n      type="button"\n      data-component="brand-theme-toggle"')
    // flips the effective mode and goes through the context's setter, which also persists the choice
    expect(logo).toContain('theme.setColorScheme(theme.mode() === "dark" ? "light" : "dark")')
    expect(logo).toContain("Switch to light mode")
    expect(logo).toContain("Switch to dark mode")
    const css = read("packages/app/src/components/titlebar.css")
    expect(css).toContain('[data-component="brand-theme-toggle"]:hover')
    expect(css).toContain('[data-component="brand-theme-toggle"]:focus-visible')
  })

  test("paints the titlebar brand purple and flips everything on it to light-on-purple", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    expect(read("packages/app/src/components/titlebar.tsx")).toContain('<header\n      data-brand-titlebar=""\n      data-slot=')
    const css = read("packages/app/src/components/titlebar.css")
    expect(css.startsWith('[data-slot="titlebar-tab-item"] {\n  user-select: none;\n}\n')).toBe(true) // upstream's rules survive
    expect(css).toContain("header[data-brand-titlebar] {")
    // the strip, the tab base and the scroll fades all read this one token
    expect(css).toContain("--v2-background-bg-deep: #7d2b8c;")
    expect(css).toContain("--background-base: #7d2b8c;") // legacy layout
    expect(css).toContain("--v2-text-text-base: #ffffff;")
    // Tailwind's --color-* aliases are resolved at :root, so every overridden token must be re-aliased in scope
    const block = scopedBlock(css, "header[data-brand-titlebar] {")
    expect(expectEveryTokenAliased(block)).toBeGreaterThan(10)
    // the lockup's purple centre block would vanish on purple, so the strip swaps its accent
    expect(block).toContain("--brand-lockup-accent: #4de8f9;")
    expect(read("packages/ui/src/components/logo.tsx")).toContain("var(--brand-lockup-accent, ")
  })

  test("turns the home page's project column into a deeper-tinted panel", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    expect(read("packages/app/src/pages/home/home-projects-view.tsx")).toContain('    <aside\n      data-brand-sidebar=""\n      class={`')
    const css = read("packages/app/src/index.css")
    // @import rules must stay first in a stylesheet, so our rules go after the last one
    expect(css.indexOf("aside[data-brand-sidebar]")).toBeGreaterThan(css.lastIndexOf("@import"))
    const light = scopedBlock(css, "aside[data-brand-sidebar] {")
    expect(light).toContain("background-color: #eadced;") // the site's card tint, deeper than the #faf6fb canvas
    expect(light).toContain("--v2-background-bg-layer-03: #ffffff;") // selected project: a white pill, like the site's cards on tint
    expect(expectEveryTokenAliased(light)).toBeGreaterThan(3)
    const dark = scopedBlock(css, ':root[data-color-scheme="dark"] aside[data-brand-sidebar] {')
    expect(dark).toContain("background-color: #341d40;") // must stay visibly lighter than the #22122a dark card it sits on
    expectEveryTokenAliased(dark)
    // the column is sticky with a tall top padding on wide screens; the panel converts that padding to margin
    expect(css).toContain("@media (min-width: 64rem) {\n  aside[data-brand-sidebar] {")
  })

  test("skins dark mode in deep plum, reading the same ramp from its dark end", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const theme = JSON.parse(read("packages/ui/src/theme/themes/oc-2.json"))
    const upstream = JSON.parse(readFileSync(path.join(FIXTURES, "packages/ui/src/theme/themes/oc-2.json"), "utf8"))
    const dark = theme.dark
    expect(dark.v2Overrides["v2-grey-1200"]).toBe("#170a1dff") // canvas
    expect(dark.v2Overrides["v2-grey-1100"]).toBe("#22122aff") // cards
    expect(dark.v2Overrides["v2-grey-100"]).toBe("#f7f2f9ff") // body text
    expect(dark.v2Overrides["v2-grey-600"]).toBe("#9486a0ff") // faintest text, lifted to hold 4.5:1 on the cards
    // surfaces get lighter as they rise: canvas < card < layers 01..04
    const lum = (hex: string) => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0)
    const rising = ["1200", "1100", "1000", "900", "800", "700"].map((step) => lum(dark.v2Overrides[`v2-grey-${step}`]))
    expect(rising).toEqual([...rising].sort((a, b) => a - b))
    // one brand purple ramp for both modes, as upstream does with its violet ramp
    for (const step of ["100", "600", "800", "1200"]) {
      expect(dark.v2Overrides[`v2-purple-${step}`]).toBe(theme.light.v2Overrides[`v2-purple-${step}`])
    }
    expect(dark.overrides["text-strong"]).toBe("#f7f2f9")
    expect(dark.overrides["surface-base"]).toBe("#26142f")
    expect(dark.palette.neutral).toBe("#22122a")
    // tokens keep pointing at the ramp; semantic colours are untouched
    expect(dark.v2Overrides["v2-background-bg-deep"]).toBe("var(--v2-grey-1200)")
    expect(dark.v2Overrides["v2-green-600"]).toBe(upstream.dark.v2Overrides["v2-green-600"])

    // the dark canvas is hard-coded for first paint in the same two files as the light one
    const context = read("packages/ui/src/theme/context.tsx")
    const preload = read("packages/app/public/oc-theme-preload.js")
    for (const file of [context, preload]) {
      expect(countOccurrences(file, 'isDark ? "#170a1d"')).toBe(2)
      expect(file).not.toContain("#080808")
    }
  })

  describe("brand config names (additive: everything upstream reads still works)", () => {
    const paths = () => read("packages/opencode/src/config/paths.ts")
    const config = () => read("packages/opencode/src/config/config.ts")
    beforeEach(() => void applyTransforms(root, TRANSFORMS, vars, brandDir))

    test("project files: simplify-code.json(c) is looked up beside opencode.json(c), only for the main config", () => {
      expect(paths()).toContain('export const BRAND = "simplify-code"')
      expect(paths()).toContain("targets: [`${name}.jsonc`, `${name}.json`, ...(name === \"opencode\" ? [`${BRAND}.jsonc`, `${BRAND}.json`] : [])],")
      // upstream relied on reversing the walk; with two name families the order has to be explicit
      expect(paths()).toContain("})).toSorted(byPrecedence)")
      expect(paths()).not.toContain("})).toReversed()")
    })

    test("folders: .simplify-code beside .opencode, and ~/.config/simplify-code beside ~/.config/opencode, only if it exists", () => {
      expect(countOccurrences(paths(), 'targets: [".opencode", BRAND_DIR],')).toBe(2)
      expect(paths()).toContain("path.join(path.dirname(Global.Path.config), BRAND)")
      expect(paths()).toContain("...(existsSync(brandGlobalDir()) ? [brandGlobalDir()] : []),")
      expect(paths()).toContain("return brandFoldersLast(unique([")
      expect(paths()).toContain("...(upstreamGlobalInUse() ? [Global.Path.config] : []),")
    })

    test("global config: upstream files are still loaded, brand files are loaded after them", () => {
      const text = config()
      const upstream = text.indexOf('loadFile(path.join(Global.Path.config, "opencode.jsonc"), env)')
      const brandNamesInUpstreamFolder = text.indexOf("for (const file of ConfigPaths.fileInDirectory(Global.Path.config, ConfigPaths.BRAND))")
      // Regression: `mv ~/.config/opencode ~/.config/simplify-code` leaves a file still NAMED opencode.json inside the brand
      // folder, so the brand folder has to read BOTH name families, upstream's first.
      const bothFamiliesInBrandFolder = text.indexOf('for (const name of ["opencode", ConfigPaths.BRAND])')
      expect(upstream).toBeGreaterThan(-1)
      expect(brandNamesInUpstreamFolder).toBeGreaterThan(upstream)
      expect(bothFamiliesInBrandFolder).toBeGreaterThan(brandNamesInUpstreamFolder)
    })

    test("a fresh install is seeded with ~/.config/simplify-code/simplify-code.jsonc, an existing opencode.json keeps being used", () => {
      const text = config()
      // ...and a moved opencode.json inside the brand folder keeps being the file the app writes to
      expect(text).toContain('...ConfigPaths.fileInDirectory(ConfigPaths.brandGlobalDir(), "opencode").toReversed(),')
      const brand = text.indexOf("...ConfigPaths.fileInDirectory(ConfigPaths.brandGlobalDir(), ConfigPaths.BRAND).toReversed(),")
      const upstream = text.indexOf('...["opencode.jsonc", "opencode.json", "config.json"].map(')
      expect(brand).toBeGreaterThan(-1)
      expect(upstream).toBeGreaterThan(brand) // first existing candidate wins; with none, the first one is created
    })

    test("per-project folders and the managed location accept both name families", () => {
      const text = config()
      expect(text).toContain('dir.endsWith(".opencode") || dir.endsWith(ConfigPaths.BRAND_DIR) || dir === Flag.OPENCODE_CONFIG_DIR')
      expect(countOccurrences(text, '["opencode.json", "opencode.jsonc", `${ConfigPaths.BRAND}.json`, `${ConfigPaths.BRAND}.jsonc`]')).toBe(2)
      expect(text).toContain("for (const managedDir of [ConfigManaged.managedConfigDir(), ConfigManaged.brandManagedConfigDir()])")
    })

    test("managed: a brand folder beside upstream's, and the brand MDM domain checked first", () => {
      const managed = read("packages/opencode/src/config/managed.ts")
      expect(managed).toContain('path.join(path.dirname(systemManagedConfigDir()), "simplify-code")')
      expect(managed).toContain("export function managedConfigDir() {") // upstream's is untouched
      const brandDomain = managed.indexOf("com.simplifyx.simplify-code.managed.plist")
      const upstreamDomain = managed.indexOf("`${MANAGED_PLIST_DOMAIN}.plist`")
      expect(brandDomain).toBeGreaterThan(-1)
      expect(upstreamDomain).toBeGreaterThan(brandDomain)
    })

    test("tui.json, `opencode mcp add` and the new core follow the same names", () => {
      const tui = read("packages/opencode/src/config/tui.ts")
      expect(countOccurrences(tui, "dir.endsWith(ConfigPaths.BRAND_DIR)")).toBe(2)
      expect(tui).toContain("[Global.Path.config, ConfigPaths.brandGlobalDir()].flatMap((dir) => ConfigPaths.fileInDirectory(dir, \"tui\"))")
      const mcp = read("packages/opencode/src/cli/cmd/mcp.ts")
      expect(mcp).toContain('path.join(baseDir, "simplify-code.json"), path.join(baseDir, "simplify-code.jsonc"), path.join(baseDir, "opencode.json")')
      expect(mcp).toContain('path.join(baseDir, ".simplify-code", "simplify-code.json")')
      expect(read("packages/core/src/config.ts")).toContain('const names = ["opencode.json", "opencode.jsonc", "simplify-code.json", "simplify-code.jsonc"]')
    })
  })

  describe("where NEW files are created", () => {
    // The helpers live inside a replacement string that is spliced into upstream's config/paths.ts, so they
    // cannot be imported. Transpile that text and run it against a fake filesystem instead of asserting on it.
    function helpers(existing: string[], globalConfig = "/home/u/.config/opencode", upstreamEntries: string[] = []) {
      const body = fill(CONFIG_PATH_HELPERS, vars)
        .split("\n")
        .filter((line) => !line.startsWith("import "))
        .join("\n")
        .replaceAll("export const", "const")
      const js = new Bun.Transpiler({ loader: "ts" }).transformSync(
        `const __make = function (path, existsSync, Global, readdirSync) {\n${body}\nreturn { writeDirIn, writeGlobalDir, byPrecedence, brandFoldersLast, upstreamGlobalInUse } }`,
      )
      const make = new Function(`${js}\nreturn __make`)() as (...args: unknown[]) => unknown
      return make(path.posix, (p: string) => existing.includes(p), { Path: { config: globalConfig } }, () => upstreamEntries) as {
        upstreamGlobalInUse(): boolean
        writeDirIn(root: string): string
        writeGlobalDir(): string
        byPrecedence(a: string, b: string): number
        brandFoldersLast(dirs: string[]): string[]
      }
    }

    test("a new project gets .simplify-code; a project that already has .opencode keeps it; having both means .simplify-code", () => {
      expect(helpers([]).writeDirIn("/p")).toBe("/p/.simplify-code")
      expect(helpers(["/p/.opencode"]).writeDirIn("/p")).toBe("/p/.opencode") // never split one project across two folders
      expect(helpers(["/p/.opencode", "/p/.simplify-code"]).writeDirIn("/p")).toBe("/p/.simplify-code")
      expect(helpers(["/p/.simplify-code"]).writeDirIn("/p")).toBe("/p/.simplify-code")
    })

    test("global files go to ~/.config/simplify-code once it exists, else to upstream's folder", () => {
      expect(helpers([]).writeGlobalDir()).toBe("/home/u/.config/opencode")
      expect(helpers(["/home/u/.config/simplify-code"]).writeGlobalDir()).toBe("/home/u/.config/simplify-code")
    })

    test("after a move to ~/.config/simplify-code, upstream's folder is left alone unless something of the user's is in it", () => {
      const moved = ["/home/u/.config/simplify-code"]
      // not migrated: always in use
      expect(helpers([], undefined, []).upstreamGlobalInUse()).toBe(true)
      // migrated, and upstream's folder is empty or holds only what upstream itself generates: leave it alone,
      // because listing it makes upstream write a .gitignore and install node_modules into it again
      expect(helpers(moved, undefined, []).upstreamGlobalInUse()).toBe(false)
      expect(helpers(moved, undefined, [".gitignore", "node_modules", "package.json", "package-lock.json"]).upstreamGlobalInUse()).toBe(false)
      // migrated, but the user still keeps something there: keep reading it
      expect(helpers(moved, undefined, ["node_modules", "agents"]).upstreamGlobalInUse()).toBe(true)
      expect(helpers(moved, undefined, ["opencode.json"]).upstreamGlobalInUse()).toBe(true)
    })

    test("read order: outer folders first, brand after upstream within a folder, brand folder after .opencode", () => {
      const h = helpers([])
      const files = ["/p/a/simplify-code.json", "/p/opencode.jsonc", "/p/a/opencode.json", "/p/simplify-code.json", "/p/opencode.json"]
      expect([...files].sort(h.byPrecedence)).toEqual(["/p/opencode.json", "/p/opencode.jsonc", "/p/simplify-code.json", "/p/a/opencode.json", "/p/a/simplify-code.json"])
      expect(h.brandFoldersLast(["/g", "/p/.simplify-code", "/p/.opencode", "/q/.simplify-code"])).toEqual(["/g", "/p/.opencode", "/p/.simplify-code", "/q/.simplify-code"])
    })

    test("every write site goes through those helpers, and plan files stay editable in plan mode", () => {
      applyTransforms(root, TRANSFORMS, vars, brandDir)
      const O = "packages/opencode/src"
      expect(read(`${O}/cli/cmd/agent.ts`)).toContain('path.join(scope === "global" ? ConfigPaths.writeGlobalDir() : ConfigPaths.writeDirIn(ctx.worktree), "agents")')
      expect(read(`${O}/cli/cmd/agent.ts`)).toContain('import { ConfigPaths } from "@/config/paths"')
      expect(read(`${O}/session/session.ts`)).toContain('? path.join(ConfigPaths.writeDirIn(instance.worktree), "plans")')
      // plan mode denies every edit except the plans folder, so the new folder needs its own allow rule, in both engines
      expect(read(`${O}/agent/agent.ts`)).toContain('[path.join(".simplify-code", "plans", "*.md")]: "allow",')
      expect(read(`${O}/agent/agent.ts`)).toContain('[path.join(".opencode", "plans", "*.md")]: "allow",')
      expect(read("packages/core/src/plugin/agent.ts")).toContain('{ action: "edit", resource: path.join(".simplify-code", "plans", "*.md"), effect: "allow" },')
      const install = read(`${O}/plugin/install.ts`)
      expect(install).toContain("return input.config ?? ConfigPaths.writeGlobalDir()")
      expect(install).toContain("return ConfigPaths.writeDirIn(root)")
      expect(install).toContain('name === "opencode" ? [...dep.files(dir, ConfigPaths.BRAND), ...dep.files(dir, name)] : dep.files(dir, name)')
      const runtime = read(`${O}/plugin/tui/runtime.ts`)
      expect(runtime).toContain('path.join(ConfigPaths.writeGlobalDir(), "themes")')
      expect(runtime).toContain('path.join(ConfigPaths.writeDirIn(state.directory), "tui.json")')
      expect(runtime).not.toContain('path.join(source_dir, ".opencode", "themes")')
    })

    test("themes written to the brand folders are also discovered, and the tips and built-in skill name them", () => {
      applyTransforms(root, TRANSFORMS, vars, brandDir)
      const theme = read("packages/tui/src/context/theme.tsx")
      expect(theme).toContain('directories.push(path.join(current, ".opencode"), path.join(current, ".simplify-code"))')
      expect(theme).toContain('path.join(path.dirname(Global.Path.config), "simplify-code")')
      const tips = read("packages/tui/src/feature-plugins/home/tips-view.tsx")
      expect(countOccurrences(tips, ".opencode/")).toBe(0)
      expect(countOccurrences(tips, ".simplify-code/")).toBe(5)
      // the model follows this built-in skill when asked to create agents, commands or skills
      const skill = read("packages/core/src/plugin/skill/customize-opencode.md")
      expect(skill).toContain("prefer the Simplify Code names")
      expect(skill).toContain("# Customizing opencode") // the upstream body is kept, not rewritten
      for (const f of ["packages/core/src/plugin/skill.ts", "packages/opencode/src/skill/index.ts"]) {
        expect(read(f)).toContain("simplify-code.json, simplify-code.jsonc, files under .simplify-code/ or ~/.config/simplify-code/")
      }
    })
  })

  test("keeps the brand on screen everywhere: a lockup in both titlebar layouts, a tagline on the wordmark", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const titlebar = read("packages/app/src/components/titlebar.tsx")
    expect(titlebar).toContain('import { BrandLockup, BrandThemeToggle } from "@opencode-ai/ui/logo"')
    // the titlebar is the only chrome present on every page; upstream has a legacy and a v2 layout
    expect(countOccurrences(titlebar, "<BrandLockup />")).toBe(2)
    expect(countOccurrences(titlebar, 'id="opencode-titlebar-right"')).toBe(2) // upstream's mount points survive

    const logo = read("packages/ui/src/components/logo.tsx")
    expect(logo).toContain("export const BrandLockup")
    // drop-ins are static files, so make sure they agree with brand.json
    expect(logo).toContain(`>${brand.productName}<`)
    expect(logo).toContain(`>${brand.tagline}<`)
    expect(read("packages/ui/src/v2/components/wordmark-v2.tsx")).toContain(`>${brand.tagline}<`)
  })

  test("rebrands the desktop shell: name, identity, updater, window chrome, icons, locales", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const config = read("packages/desktop/electron-builder.config.ts")
    expect(config).toContain('productName: "Simplify Code",')
    expect(config).toContain('protocols: { name: "Simplify Code", schemes: ["simplify-code"] },')
    expect(config).not.toContain('repo: "opencode", channel: "latest"') // no publish config: no resources/app-update.yml pointing at anomalyco
    expect(config).toContain('prod: "com.simplifyx.simplify-code.desktop",')
    expect(config).toContain('artifactName: "simplify-code-desktop-${os}-${arch}.${ext}",')

    const main = read("packages/desktop/src/main/index.ts")
    expect(main).toContain('prod: "Simplify Code",')
    expect(main).toContain('prod: "com.simplifyx.simplify-code.desktop",')
    // the app must never pull upstream's release feed and update itself back to stock
    expect(read("packages/desktop/src/main/constants.ts")).toContain("export const UPDATER_ENABLED = false")
    expect(read("packages/desktop/src/main/constants.ts")).not.toContain("app.isPackaged && CHANNEL")
    expect(read("packages/desktop/src/main/windows.ts")).toContain('title: "Simplify Code",')
    expect(read("packages/desktop/src/renderer/index.html")).toContain("<title>Simplify Code</title>")

    const icns = readFileSync(path.join(root, "packages/desktop/icons/prod/icon.icns"))
    expect(icns.subarray(0, 4).toString("latin1")).toBe("icns")
    expect(read("packages/desktop/src/renderer/i18n/en.ts")).toContain("latest version of Simplify Code")
    expect(countOccurrences(read("packages/desktop/src/renderer/i18n/de.ts"), "Simplify Code")).toBe(2)
  })

  test("leaves no unaccounted OpenCode string anywhere in the fixture tree", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const files = (readdirSync(root, { recursive: true }) as string[]).filter((rel) => statSync(path.join(root, rel)).isFile())
    expect(files.length).toBeGreaterThan(UPSTREAM_FILES.length)
    for (const rel of files) {
      const kept = KEPT_OPENCODE.find((k) => k.file === rel)
      expect({ file: rel, occurrences: countOccurrences(read(rel), "OpenCode") }).toEqual({
        file: rel,
        occurrences: kept?.count ?? 0,
      })
      if (kept) expect(read(rel)).toContain(kept.contains)
    }
  })

  test("repoints the upgrader at the scoped package and release repo", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const inst = read("packages/opencode/src/installation/index.ts")
    // every remaining "opencode-ai" must be part of an @opencode-ai/* workspace import
    expect(countOccurrences(inst, "opencode-ai")).toBe(countOccurrences(inst, "@opencode-ai/"))
    expect(countOccurrences(inst, '"opencode-ai"')).toBe(0)
    expect(countOccurrences(inst, "opencode-ai@")).toBe(0)
    expect(countOccurrences(inst, "/opencode-ai/")).toBe(0)
    expect(inst).not.toContain("anomalyco/opencode")
    expect(inst).toContain('"@simplifyx/simplify-code"')
    expect(inst).toContain("/@simplifyx%2Fsimplify-code/${InstallationChannel}")
    expect(countOccurrences(inst, "@simplifyx/simplify-code@${target}")).toBe(3)
    expect(inst).toContain("https://api.github.com/repos/simplifyx/simplify-code-releases/releases/latest")
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

describe("desktop cross-build target", () => {
  test("the terminal module baked into the desktop app follows the build target, defaulting to the host", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const cfg = read("packages/desktop/electron.vite.config.ts")
    expect(cfg).toContain("process.env.OVERLAY_TARGET_PLATFORM ?? process.platform")
    expect(cfg).toContain("process.env.OVERLAY_TARGET_ARCH ?? process.arch")
  })
})

describe("desktop publisher", () => {
  test("Windows shows the company as publisher, and upstream keeps the copyright it owns", () => {
    applyTransforms(root, TRANSFORMS, vars, brandDir)
    const pkg = JSON.parse(read("packages/desktop/package.json"))
    expect(pkg.author.name).toBe("SimplifyX")
    // electron-builder names the one-click per-user install folder after the PACKAGE name, not the product:
    // %LOCALAPPDATA%\Programs\@opencode-aidesktop on the first Windows install
    expect(pkg.name).toBe("simplify-code-desktop")
    expect(pkg.dependencies["@opencode-ai/plugin"] ?? pkg.devDependencies["@opencode-ai/app"]).toBeDefined() // workspace deps untouched
    const cfg = read("packages/desktop/electron-builder.config.ts")
    expect(cfg).toContain('copyright: "Copyright © OpenCode contributors, MIT License. Distributed by SimplifyX.",')
  })
})

describe("company-controlled team folder and plugin lock", () => {
  beforeEach(() => void applyTransforms(root, TRANSFORMS, vars, brandDir))
  const managed = () => read("packages/opencode/src/config/managed.ts")
  const config = () => read("packages/opencode/src/config/config.ts")

  test("the team folder lives inside the brand managed folder and has a test hook", () => {
    expect(managed()).toContain("export function brandTeamConfigDir() {")
    expect(managed()).toContain('process.env.OPENCODE_TEST_BRAND_TEAM_CONFIG_DIR || path.join(brandManagedConfigDir(), "team")')
  })

  test("the team folder is a config directory, so its agents, commands, skills, plugins and config files load", () => {
    const paths = read("packages/opencode/src/config/paths.ts")
    expect(paths).toContain("...(existsSync(ConfigManaged.brandTeamConfigDir()) ? [ConfigManaged.brandTeamConfigDir()] : []),")
    expect(config()).toContain(
      'dir.endsWith(".opencode") || dir.endsWith(ConfigPaths.BRAND_DIR) || dir === Flag.OPENCODE_CONFIG_DIR || dir === ConfigManaged.brandTeamConfigDir()',
    )
    const tui = read("packages/opencode/src/config/tui.ts")
    expect(countOccurrences(tui, "ConfigManaged.brandTeamConfigDir()")).toBe(2)
  })

  test("the plugin lock is a marker file only an administrator can create, and it keeps administrator-declared plugins only", () => {
    expect(managed()).toContain("export function pluginLockEnabled() {")
    expect(managed()).toContain('existsSync(path.join(brandManagedConfigDir(), "plugin-lock"))')
    expect(managed()).toContain("export function isAdminSource(source: string) {")
    const text = config()
    const lock = text.indexOf("if (ConfigManaged.pluginLockEnabled() && result.plugin_origins) {")
    const mdm = text.indexOf("const managed = yield* Effect.promise(() => ConfigManaged.readManagedPreferences())")
    const modes = text.indexOf("for (const [name, mode] of Object.entries(result.mode ?? {})) {")
    expect(lock).toBeGreaterThan(mdm) // after every source has been merged
    expect(lock).toBeLessThan(modes)
    expect(text).toContain("result.plugin = kept.map((item) => item.spec)")
  })

  test("a missing {file:} reference in an administrator's config resolves to empty instead of stopping the app", () => {
    // a developer who has not placed their gateway key yet must still be able to start the app
    expect(config()).toContain(
      '{ text, type: "path", path: options.path, env, missing: ConfigManaged.isAdminSource(options.path) ? "empty" : "error" }',
    )
  })

  test("isAdminSource: managed folders, the team folder and MDM count; a developer's own files do not", () => {
    // executed, not just read: the rule is small but is the whole point of the lock
    const body = managed()
      .split("\n")
      .filter((line) => !line.startsWith("import ") && !line.startsWith("export * as"))
      .join("\n")
      .replace(/^export (async function|function|const|let)/gm, "$1")
    const js = new Bun.Transpiler({ loader: "ts" }).transformSync(
      `const __make = function (path, existsSync, os, process, Process) {\n${body}\nreturn { isAdminSource } }`,
    )
    const make = new Function(`${js}\nreturn __make`)() as (...args: unknown[]) => { isAdminSource(s: string): boolean }
    const env = {
      OPENCODE_TEST_MANAGED_CONFIG_DIR: "/managed/opencode",
      OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR: "/managed/simplify-code",
      OPENCODE_TEST_BRAND_TEAM_CONFIG_DIR: "/managed/simplify-code/team",
    }
    const m = make(path.posix, () => false, { platform: () => "darwin", homedir: () => "/home/u", userInfo: () => ({ username: "u" }) }, { env, platform: "darwin" }, {})
    expect(m.isAdminSource("/managed/simplify-code/simplify-code.jsonc")).toBe(true)
    expect(m.isAdminSource("/managed/simplify-code/team/plugins/ciso-session.js")).toBe(true)
    expect(m.isAdminSource("/managed/opencode/opencode.json")).toBe(true)
    expect(m.isAdminSource("mobileconfig:/Library/Managed Preferences/com.simplifyx.simplify-code.managed.plist")).toBe(true)
    expect(m.isAdminSource("/home/u/.config/simplify-code/simplify-code.json")).toBe(false)
    expect(m.isAdminSource("/home/u/projects/app/.simplify-code/plugins/x.js")).toBe(false)
    expect(m.isAdminSource("/managed/simplify-code-evil/x.json")).toBe(false) // prefix, not a real child
  })
})

describe("no traces of the upstream name on an installed machine", () => {
  beforeEach(() => void applyTransforms(root, TRANSFORMS, vars, brandDir))

  test("data, cache, config and state folders, and the database file, are named after the product", () => {
    expect(read("packages/core/src/global.ts")).toContain('const app = "simplify-code"')
    expect(read("packages/core/src/database/database.ts")).toContain('join(Global.Path.data, "simplify-code.db")')
  })

  test("the command is named after the product: the binary, the help header and the user agent", () => {
    const build = read("packages/opencode/script/build.ts")
    expect(build).toContain("outfile: `dist/${name}/bin/simplify-code`,")
    expect(build).toContain("const binaryPath = `dist/${name}/bin/simplify-code`") // upstream's own smoke test
    expect(build).toContain("`--user-agent=simplify-code/${Script.version}`")
    expect(read("packages/opencode/src/index.ts")).toContain('.scriptName("simplify-code")')
  })

  test("messages that tell the user to run a command name the right command", () => {
    for (const file of ["packages/tui/src/util/error.ts", "packages/opencode/src/cli/error.ts"]) {
      const text = read(file)
      expect(text).toContain("simplify-code models")
      expect(text).toContain("simplify-code auth login ${url}")
      expect(text).toContain("Note, Simplify Code does not support MCP authentication yet.")
    }
    expect(read("packages/opencode/src/cli/cmd/upgrade.ts")).toContain('describe: "upgrade Simplify Code to the latest or a specific version"')
    expect(read("packages/opencode/src/cli/cmd/serve.ts")).toContain("`Simplify Code server listening on http://")
    expect(read("packages/opencode/src/cli/cmd/providers.ts")).toContain('describe: "simplify-code auth provider"')
    expect(read("packages/opencode/src/cli/cmd/debug/index.ts")).toContain("`Simplify Code version: ${InstallationVersion}`")
    for (const file of [
      "packages/tui/src/util/error.ts",
      "packages/opencode/src/cli/error.ts",
      "packages/opencode/src/cli/cmd/upgrade.ts",
      "packages/opencode/src/cli/cmd/serve.ts",
      "packages/opencode/src/cli/cmd/pr.ts",
      "packages/opencode/src/cli/cmd/providers.ts",
      "packages/opencode/src/cli/cmd/debug/index.ts",
    ]) {
      // no user-facing "opencode <word>" left; comments may keep it
      const code = read(file).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
      expect(code).not.toMatch(/[`"']opencode /)
    }
  })

  test("deep links use the product's own scheme end to end", () => {
    expect(read("packages/desktop/src/main/index.ts")).toContain('arg.startsWith("simplify-code://")')
    expect(read("packages/app/src/pages/layout/deep-links.ts")).toContain('input.startsWith("simplify-code://")')
  })
})

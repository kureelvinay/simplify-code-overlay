import type { Transform } from "./rebrand"

const TUI = "packages/tui/src"
const CMD = "packages/opencode/src/cli/cmd"
const INSTALL = "packages/opencode/src/installation/index.ts"
const UI = "packages/ui/src"
const APP = "packages/app"
const FAVICON = `${UI}/assets/favicon`
const DESKTOP = "packages/desktop"
const DESKTOP_ICONS = `${DESKTOP}/icons/prod`

/** Spliced into upstream's config/paths.ts by transform 71. Exported so the tests can execute it, not just read it. */
export const CONFIG_PATH_HELPERS = "import { FSUtil } from \"@opencode-ai/core/fs-util\"\nimport { existsSync, readdirSync } from \"fs\"\n\n// {{productName}}: brand config names and folders, read in addition to upstream's. Everything upstream\n// reads still works; where both exist, the brand one is merged later and therefore wins.\nexport const BRAND = \"{{productSlug}}\"\nexport const BRAND_DIR = `.${BRAND}`\n/** ~/.config/<brand>, beside upstream's ~/.config/opencode */\nexport const brandGlobalDir = () => path.join(path.dirname(Global.Path.config), BRAND)\nconst isBrand = (file: string) => path.basename(file).startsWith(`${BRAND}.`)\n/** Outer directories first so closer ones win; within one directory upstream names, then brand names; .json before .jsonc. */\nconst byPrecedence = (a: string, b: string) =>\n  path.dirname(a).length - path.dirname(b).length ||\n  Number(isBrand(a)) - Number(isBrand(b)) ||\n  Number(a.endsWith(\".jsonc\")) - Number(b.endsWith(\".jsonc\"))\n/** Keep a brand folder after the upstream folder beside it, so it is merged later. */\nconst brandFoldersLast = (dirs: string[]) => {\n  const out = [...dirs]\n  for (let i = 0; i < out.length; i++) {\n    if (path.basename(out[i]) !== BRAND_DIR) continue\n    const j = out.findIndex((d, k) => k > i && path.basename(d) === \".opencode\" && path.dirname(d) === path.dirname(out[i]))\n    if (j !== -1) [out[i], out[j]] = [out[j], out[i]]\n  }\n  return out\n}\n/**\n * Where NEW files go inside a project or home root. A root that already has upstream's folder and no\n * brand folder keeps using it, so one project's files are never split across two folders.\n */\nexport const writeDirIn = (root: string) =>\n  existsSync(path.join(root, \".opencode\")) && !existsSync(path.join(root, BRAND_DIR))\n    ? path.join(root, \".opencode\")\n    : path.join(root, BRAND_DIR)\n/** Where NEW global files go: the brand folder once it exists (a fresh install is seeded with it), else upstream's. */\nexport const writeGlobalDir = () => (existsSync(brandGlobalDir()) ? brandGlobalDir() : Global.Path.config)\n/** What upstream itself generates in a config folder; none of it is the user's. */\nconst SCAFFOLD = new Set([\".gitignore\", \"node_modules\", \"package.json\", \"package-lock.json\", \"bun.lock\", \"bun.lockb\"])\n/**\n * After `mv ~/.config/opencode ~/.config/{{productSlug}}`, upstream recreates its folder empty at startup. Listing it would\n * make upstream write a .gitignore and install node_modules into it again, so once the brand folder exists,\n * upstream's is listed only while it still holds something of the user's.\n */\nexport const upstreamGlobalInUse = () => {\n  if (!existsSync(brandGlobalDir())) return true\n  try {\n    return readdirSync(Global.Path.config).some((entry) => !SCAFFOLD.has(String(entry)))\n  } catch {\n    return false\n  }\n}\n"

// Appended to upstream's index.css by transform 68.
const SIDEBAR_PANEL_CSS = "\n/* Brand: the home page's project column as a deeper-tinted panel. Same technique as the titlebar strip\n   (components/titlebar.css): re-point the theme tokens for the subtree, re-aliasing each for Tailwind. */\naside[data-brand-sidebar] {\n  background-color: #eadced;\n  border-radius: 12px;\n  padding: 12px 6px 8px;\n  --v2-background-bg-layer-03: #ffffff; /* selected project: a white pill, like the site's white cards on tint */\n  --color-v2-background-bg-layer-03: var(--v2-background-bg-layer-03);\n  --v2-background-bg-layer-01: #f5eef7;\n  --color-v2-background-bg-layer-01: var(--v2-background-bg-layer-01);\n  --v2-overlay-simple-overlay-hover: rgba(125, 43, 140, 0.1); /* hover: a wash of the brand purple */\n  --color-v2-overlay-simple-overlay-hover: var(--v2-overlay-simple-overlay-hover);\n  --v2-text-text-muted: #51115c; /* the Projects heading and secondary labels in deep brand purple */\n  --color-v2-text-text-muted: var(--v2-text-text-muted);\n  --v2-text-text-faint: #5d6472; /* upstream's faint grey drops to 3:1 on the tint; this holds 4.9:1 */\n  --color-v2-text-text-faint: var(--v2-text-text-faint);\n  --v2-icon-icon-muted: #6a2378;\n  --color-v2-icon-icon-muted: var(--v2-icon-icon-muted);\n  --v2-border-border-base: #d9bfe0;\n  --color-v2-border-border-base: var(--v2-border-border-base);\n}\n\n:root[data-color-scheme=\"dark\"] aside[data-brand-sidebar] {\n  background-color: #341d40;\n  --v2-background-bg-layer-03: #4f2c5f;\n  --color-v2-background-bg-layer-03: var(--v2-background-bg-layer-03);\n  --v2-background-bg-layer-01: #3c2249;\n  --color-v2-background-bg-layer-01: var(--v2-background-bg-layer-01);\n  --v2-overlay-simple-overlay-hover: rgba(255, 255, 255, 0.08);\n  --color-v2-overlay-simple-overlay-hover: var(--v2-overlay-simple-overlay-hover);\n  --v2-text-text-muted: #ddb3e8;\n  --color-v2-text-text-muted: var(--v2-text-text-muted);\n  --v2-text-text-faint: #c49ad0;\n  --color-v2-text-text-faint: var(--v2-text-text-faint);\n  --v2-icon-icon-muted: #c98fd9;\n  --color-v2-icon-icon-muted: var(--v2-icon-icon-muted);\n  --v2-border-border-base: #63386f;\n  --color-v2-border-border-base: var(--v2-border-border-base);\n}\n\n/* Upstream gives the column 56px of margin and 52px of padding on wide screens so its heading lines up\n   with the search box, and makes it sticky. A painted panel would show that padding as a tall empty\n   band, so 40px of it moves into the margin (and into the sticky offset and height, to match). */\n@media (min-width: 64rem) {\n  aside[data-brand-sidebar] {\n    margin-top: 6rem;\n    top: 6rem;\n    padding-top: 12px;\n    height: calc(100cqh - 6rem - 8px);\n  }\n}\n"

// Appended to upstream's titlebar.css by transform 66.
const TITLEBAR_STRIP_CSS = "\n/* Brand: brand-purple titlebar strip, in both colour schemes.\n   Everything on the titlebar reads theme tokens, so the tokens are re-pointed for this subtree\n   instead of restyling each child. Tailwind's --color-* aliases are resolved once at :root, so\n   each overridden token is re-aliased here or the utility classes would keep the old colour.\n   Menus and tooltips are portalled to <body> and keep the normal theme. */\nheader[data-brand-titlebar] {\n  --v2-background-bg-deep: #7d2b8c; /* the strip itself, the inactive tab base and the tab-scroll fades */\n  --color-v2-background-bg-deep: var(--v2-background-bg-deep);\n  --background-base: #7d2b8c; /* legacy titlebar layout */\n  --color-background-base: var(--background-base);\n  --v2-background-bg-layer-02: #9a4bb0; /* active and hovered tab */\n  --color-v2-background-bg-layer-02: var(--v2-background-bg-layer-02);\n  --v2-background-bg-layer-03: #b56fc7; /* tab separators */\n  --color-v2-background-bg-layer-03: var(--v2-background-bg-layer-03);\n  --v2-text-text-base: #ffffff;\n  --color-v2-text-text-base: var(--v2-text-text-base);\n  --v2-text-text-muted: #ecdff0;\n  --color-v2-text-text-muted: var(--v2-text-text-muted);\n  --v2-text-text-faint: #d9bfe0;\n  --color-v2-text-text-faint: var(--v2-text-text-faint);\n  --v2-text-text-accent: #4de8f9; /* site teal: the one accent that reads on purple */\n  --color-v2-text-text-accent: var(--v2-text-text-accent);\n  --v2-icon-icon-base: #ffffff;\n  --color-v2-icon-icon-base: var(--v2-icon-icon-base);\n  --v2-icon-icon-muted: #ecdff0;\n  --color-v2-icon-icon-muted: var(--v2-icon-icon-muted);\n  --v2-icon-icon-accent: #4de8f9;\n  --color-v2-icon-icon-accent: var(--v2-icon-icon-accent);\n  --v2-border-border-muted: #9a4bb0;\n  --color-v2-border-border-muted: var(--v2-border-border-muted);\n  --v2-border-border-base: #b56fc7;\n  --color-v2-border-border-base: var(--v2-border-border-base);\n  --text-strong: #ffffff; /* legacy (v1) tokens */\n  --color-text-strong: var(--text-strong);\n  --text-base: #ecdff0;\n  --color-text-base: var(--text-base);\n  --text-weak: #d9bfe0;\n  --color-text-weak: var(--text-weak);\n  --icon-strong-base: #ffffff;\n  --color-icon-strong-base: var(--icon-strong-base);\n  --icon-base: #ecdff0;\n  --color-icon-base: var(--icon-base);\n  --icon-weak-base: #d9bfe0;\n  --color-icon-weak-base: var(--icon-weak-base);\n  --border-weak-base: #9a4bb0;\n  --color-border-weak-base: var(--border-weak-base);\n  --v2-overlay-simple-overlay-hover: rgba(255, 255, 255, 0.14);\n  --color-v2-overlay-simple-overlay-hover: var(--v2-overlay-simple-overlay-hover);\n  --v2-overlay-simple-overlay-pressed: rgba(255, 255, 255, 0.24);\n  --color-v2-overlay-simple-overlay-pressed: var(--v2-overlay-simple-overlay-pressed);\n  --brand-lockup-accent: #4de8f9;\n}\n\n/* The light/dark toggle (BrandThemeToggle in our logo.tsx drop-in). */\n[data-component=\"brand-theme-toggle\"]:hover {\n  background: var(--v2-overlay-simple-overlay-hover) !important;\n}\n[data-component=\"brand-theme-toggle\"]:active {\n  background: var(--v2-overlay-simple-overlay-pressed) !important;\n}\n[data-component=\"brand-theme-toggle\"]:focus-visible {\n  outline: 2px solid var(--v2-text-text-accent);\n  outline-offset: 1px;\n}\n"

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

  // 16-17. `opencode uninstall` prompts
  {
    kind: "edit",
    file: `${CMD}/uninstall.ts`,
    find: "Uninstall OpenCode",
    replace: "Uninstall {{productName}}",
    count: 1,
  },
  {
    kind: "edit",
    file: `${CMD}/uninstall.ts`,
    find: "Thank you for using OpenCode!",
    replace: "Thank you for using {{productName}}!",
    count: 1,
  },

  // 18. Scrollback splash title next to the mark (anchored on the push call, which
  // is the only place the literal appears)
  {
    kind: "edit",
    file: `${CMD}/run/splash.ts`,
    find: 'top, "OpenCode", right',
    replace: 'top, "{{productName}}", right',
    count: 1,
  },

  // 19-21. The `opencode run` copies of the permission dialog and prompt strings
  {
    kind: "edit",
    file: `${CMD}/run/footer.permission.tsx`,
    find: "Tell OpenCode what to do differently",
    replace: "Tell {{productName}} what to do differently",
    count: 2,
  },
  {
    kind: "edit",
    file: `${CMD}/run/permission.shared.ts`,
    find: "until OpenCode is restarted",
    replace: "until {{productName}} is restarted",
    count: 2,
  },
  {
    kind: "edit",
    file: `${CMD}/run/footer.prompt.tsx`,
    find: "close OpenCode",
    replace: "close {{productName}}",
    count: 1,
  },

  // 22. Sidebar footer hint (names the app, not OpenCode Zen)
  {
    kind: "edit",
    file: `${TUI}/feature-plugins/sidebar/footer.tsx`,
    find: "OpenCode includes free models",
    replace: "{{productName}} includes free models",
    count: 1,
  },

  // ---------------------------------------------------------------------------
  // Graphical UI (packages/app + packages/ui): served by `opencode web` and wrapped
  // by the desktop app. packages/app/public/* are symlinks into the ui package, so
  // each asset is replaced once.
  // ---------------------------------------------------------------------------

  // 23. Brand accents on the GUI's default theme. A json patch rather than a drop-in, so new
  // upstream keys flow through and a renamed key fails the run. The id stays "oc-2" so saved
  // theme preferences keep resolving. Dark-mode purples are lightened for contrast.
  {
    kind: "json",
    file: `${UI}/theme/themes/oc-2.json`,
    set: {
      name: "{{productName}}",
      "light.palette.primary": "#7d2b8c",
      "light.palette.interactive": "#7d2b8c",
      "light.overrides.surface-interactive-weak": "#F9F4FA",

      // Light skin, from simplifyx.com: white cards on a lavender-tinted canvas, navy text,
      // cool grey secondary text. Every surface, text, icon and border token resolves
      // through the grey ramp, so the ramp is what gets re-tinted; tokens keep pointing at it.
      "light.palette.neutral": "#f3eaf6",
      "light.palette.ink": "#1f242d", // site --secondary
      "light.palette.info": "#137aaa", // site blue
      "light.v2Overrides.v2-grey-50": "#ffffffff",
      "light.v2Overrides.v2-grey-100": "#f3eaf6ff", // canvas: deliberately stronger than the site's #f9f4fa, which read as plain white in an app
      "light.v2Overrides.v2-grey-200": "#ede1f1ff",
      "light.v2Overrides.v2-grey-300": "#e6d8ebff",
      "light.v2Overrides.v2-grey-400": "#d9c8dfff",
      "light.v2Overrides.v2-grey-500": "#aaa5b3ff",
      "light.v2Overrides.v2-grey-600": "#7c818bff", // site border grey, opaque
      "light.v2Overrides.v2-grey-700": "#4f5766ff", // site --accent-gray
      "light.v2Overrides.v2-grey-800": "#363c48ff",
      "light.v2Overrides.v2-grey-900": "#2a303bff",
      "light.v2Overrides.v2-grey-1000": "#1f242dff", // site --secondary (navy)
      "light.v2Overrides.v2-grey-1100": "#161a21ff",
      "light.v2Overrides.v2-grey-1200": "#0a0c10ff",
      // Brand purples replace upstream's violet ramp (avatars, type syntax colour, badges)
      "light.v2Overrides.v2-purple-100": "#f9f4faff",
      "light.v2Overrides.v2-purple-200": "#eadcedff", // site card tint
      "light.v2Overrides.v2-purple-300": "#d9bfe0ff",
      "light.v2Overrides.v2-purple-400": "#c49ad0ff",
      "light.v2Overrides.v2-purple-500": "#a866b8ff",
      "light.v2Overrides.v2-purple-600": "#7d2b8cff", // site --accent
      "light.v2Overrides.v2-purple-700": "#6a2378ff",
      "light.v2Overrides.v2-purple-800": "#51115cff", // site CTA purple
      "light.v2Overrides.v2-purple-900": "#420d4bff",
      "light.v2Overrides.v2-purple-1000": "#340a3bff",
      "light.v2Overrides.v2-purple-1100": "#27082dff",
      "light.v2Overrides.v2-purple-1200": "#1b0520ff",
      // The legacy (v1) tokens are literal colours, not ramp references
      "light.overrides.text-strong": "#1f242d",
      "light.overrides.text-base": "#4f5766",
      "light.overrides.text-weak": "#7c818b",
      "light.overrides.text-weaker": "#bfc2c9",
      "light.overrides.border-weak-base": "#d9c8df",
      "light.overrides.border-weaker-base": "#e6d8eb",
      "light.overrides.icon-base": "#7c818b",
      "light.overrides.icon-weak-base": "#bfc2c9",
      "light.overrides.surface-raised-base": "#ede1f1",
      "light.overrides.surface-raised-base-hover": "#e6d8eb",
      "light.overrides.surface-base": "#f3eaf6",

      "light.v2Overrides.v2-background-bg-accent": "#7d2b8cff",
      "light.v2Overrides.v2-text-text-accent": "#7d2b8cff",
      "light.v2Overrides.v2-text-text-accent-hover": "#51115cff",
      "light.v2Overrides.v2-text-text-code-accent": "#51115cff",
      "light.v2Overrides.v2-icon-icon-accent": "#7d2b8cff",
      "light.v2Overrides.v2-icon-icon-accent-hover": "#51115cff",
      "light.v2Overrides.v2-border-border-focus": "#9a4bb0ff",
      "dark.palette.primary": "#b56fc7",
      "dark.palette.interactive": "#b56fc7",
      "dark.overrides.surface-interactive-weak": "#2A1530",
      "dark.v2Overrides.v2-background-bg-accent": "#7d2b8cff",
      "dark.v2Overrides.v2-text-text-accent": "#c98fd9ff",
      "dark.v2Overrides.v2-text-text-accent-hover": "#ddb3e8ff",
      "dark.v2Overrides.v2-text-text-code-accent": "#c98fd9ff",
      "dark.v2Overrides.v2-icon-icon-accent": "#c98fd9ff",
      "dark.v2Overrides.v2-icon-icon-accent-hover": "#ddb3e8ff",
      "dark.v2Overrides.v2-border-border-focus": "#b56fc7ff",

      // Dark skin: deep plum. Dark mode reads the same grey ramp from its other end (canvas 1200, cards
      // 1100, raised layers 1000 to 700, text 100 to 600), so the whole ramp is re-tinted and the tokens
      // keep pointing at it. Previewed live against the running UI before these values were chosen.
      "dark.palette.neutral": "#22122a",
      "dark.palette.ink": "#f7f2f9",
      "dark.v2Overrides.v2-grey-50": "#ffffffff",
      "dark.v2Overrides.v2-grey-100": "#f7f2f9ff", // body text
      "dark.v2Overrides.v2-grey-200": "#efe9f2ff",
      "dark.v2Overrides.v2-grey-300": "#e6deeaff",
      "dark.v2Overrides.v2-grey-400": "#d5cadbff",
      "dark.v2Overrides.v2-grey-500": "#b3a6bbff",
      "dark.v2Overrides.v2-grey-600": "#9486a0ff", // faintest text: lifted so it holds 4.5:1 on the cards
      "dark.v2Overrides.v2-grey-700": "#60456dff", // layer 04 and contrast surfaces
      "dark.v2Overrides.v2-grey-800": "#452a53ff",
      "dark.v2Overrides.v2-grey-900": "#372042ff",
      "dark.v2Overrides.v2-grey-1000": "#2c1936ff",
      "dark.v2Overrides.v2-grey-1100": "#22122aff", // cards
      "dark.v2Overrides.v2-grey-1200": "#170a1dff", // canvas
      // the same brand purple ramp as light mode, as upstream does with its violet ramp
      "dark.v2Overrides.v2-purple-100": "#f9f4faff",
      "dark.v2Overrides.v2-purple-200": "#eadcedff",
      "dark.v2Overrides.v2-purple-300": "#d9bfe0ff",
      "dark.v2Overrides.v2-purple-400": "#c49ad0ff",
      "dark.v2Overrides.v2-purple-500": "#a866b8ff",
      "dark.v2Overrides.v2-purple-600": "#7d2b8cff",
      "dark.v2Overrides.v2-purple-700": "#6a2378ff",
      "dark.v2Overrides.v2-purple-800": "#51115cff",
      "dark.v2Overrides.v2-purple-900": "#420d4bff",
      "dark.v2Overrides.v2-purple-1000": "#340a3bff",
      "dark.v2Overrides.v2-purple-1100": "#27082dff",
      "dark.v2Overrides.v2-purple-1200": "#1b0520ff",
      // the legacy (v1) tokens are literal colours
      "dark.overrides.text-strong": "#f7f2f9",
      "dark.overrides.text-base": "#b3a6bb",
      "dark.overrides.text-weak": "#9486a0",
      "dark.overrides.text-weaker": "#65546f",
      "dark.overrides.border-weak-base": "#3b2347",
      "dark.overrides.border-weaker-base": "#311c3c",
      "dark.overrides.icon-base": "#9a8aa3",
      "dark.overrides.icon-weak-base": "#4a3556",
      "dark.overrides.surface-raised-base": "#311c3c",
      "dark.overrides.surface-raised-base-hover": "#3b2347",
      "dark.overrides.surface-base": "#26142f",
    },
  },

  // 24-25. Logo, mark, splash and the new-session wordmark
  { kind: "dropin", file: `${UI}/components/logo.tsx`, source: "gui/logo.tsx" },
  { kind: "dropin", file: `${UI}/v2/components/wordmark-v2.tsx`, source: "gui/wordmark-v2.tsx" },

  // 26-30. Page and window chrome
  { kind: "edit", file: `${APP}/index.html`, find: "<title>OpenCode</title>", replace: "<title>{{productName}}</title>", count: 1 },
  { kind: "edit", file: `${FAVICON}/site.webmanifest`, find: '"name": "OpenCode"', replace: '"name": "{{productName}}"', count: 1 },
  { kind: "edit", file: `${FAVICON}/site.webmanifest`, find: '"short_name": "OpenCode"', replace: '"short_name": "{{productName}}"', count: 1 },
  { kind: "edit", file: `${UI}/components/favicon.tsx`, find: 'content="OpenCode"', replace: 'content="{{productName}}"', count: 1 },
  {
    kind: "edit",
    file: `${APP}/src/components/windows-app-menu.tsx`,
    find: 'desktop-app-menu-heading">OpenCode<',
    replace: 'desktop-app-menu-heading">{{productName}}<',
    count: 1,
  },

  // 57-59. Keep the brand on screen on every page, with a one-click light/dark toggle beside it. The titlebar is the only chrome that is
  // always present, and upstream has two layouts of it (legacy and v2), so the lockup from our
  // logo.tsx drop-in goes at the right end of both, after upstream's own mount point.
  {
    kind: "edit",
    file: `${APP}/src/components/titlebar.tsx`,
    find: 'import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"\n',
    replace: 'import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"\nimport { BrandLockup, BrandThemeToggle } from "@opencode-ai/ui/logo"\n',
    count: 1,
  },
  {
    kind: "edit",
    file: `${APP}/src/components/titlebar.tsx`,
    find: '<div id="opencode-titlebar-right" class="flex items-center gap-1 shrink-0 justify-end" />',
    replace: '<div id="opencode-titlebar-right" class="flex items-center gap-1 shrink-0 justify-end" />\n              <BrandThemeToggle />\n              <BrandLockup />',
    count: 1,
  },
  {
    kind: "edit",
    file: `${APP}/src/components/titlebar.tsx`,
    find: '<div id="opencode-titlebar-right" class="flex shrink-0 items-center justify-end gap-0" />',
    replace: '<div id="opencode-titlebar-right" class="flex shrink-0 items-center justify-end gap-0" />\n      <BrandThemeToggle />\n      <BrandLockup />',
    count: 1,
  },

  // 65-66. Brand-purple titlebar strip. The header gets a marker attribute, and a scoped block
  // appended after the first rule of upstream's titlebar.css re-points the theme tokens for that subtree.
  {
    kind: "edit",
    file: `${APP}/src/components/titlebar.tsx`,
    find: '<header\n      data-slot={useV2Titlebar() ? "titlebar-v2" : undefined}',
    replace: '<header\n      data-brand-titlebar=""\n      data-slot={useV2Titlebar() ? "titlebar-v2" : undefined}',
    count: 1,
  },
  {
    kind: "edit",
    file: `${APP}/src/components/titlebar.css`,
    find: '[data-slot="titlebar-tab-item"] {\n  user-select: none;\n}\n',
    replace: '[data-slot="titlebar-tab-item"] {\n  user-select: none;\n}\n' + TITLEBAR_STRIP_CSS,
    count: 1,
  },

  // 67-68. The home page's project column becomes a deeper-tinted panel. index.css is the app's global
  // stylesheet; @import rules must stay first, so the block goes after the last of them.
  {
    kind: "edit",
    file: `${APP}/src/pages/home/home-projects-view.tsx`,
    find: "    <aside\n      class={`",
    replace: '    <aside\n      data-brand-sidebar=""\n      class={`',
    count: 1,
  },
  {
    kind: "edit",
    file: `${APP}/src/index.css`,
    find: '@import "tw-animate-css";\n',
    replace: '@import "tw-animate-css";\n' + SIDEBAR_PANEL_CSS,
    count: 1,
  },

  // 60-64. The light canvas colour is hard-coded in three places outside the theme file (it paints
  // before the theme loads); match them so there is no grey flash. And default to light, like the
  // site: a stored user preference still wins, and dark stays one click away in Settings.
  { kind: "edit", file: `${UI}/theme/context.tsx`, find: ': "#fafafa"', replace: ': "#f3eaf6"', count: 2 },
  {
    kind: "edit",
    file: `${UI}/theme/context.tsx`,
    find: '(read(STORAGE_KEYS.COLOR_SCHEME) as ColorScheme | null) ?? "system"',
    replace: '(read(STORAGE_KEYS.COLOR_SCHEME) as ColorScheme | null) ?? "light"',
    count: 2,
  },
  { kind: "edit", file: `${APP}/public/oc-theme-preload.js`, find: ': "#fafafa"', replace: ': "#f3eaf6"', count: 2 },
  {
    kind: "edit",
    file: `${APP}/public/oc-theme-preload.js`,
    find: 'localStorage.getItem("opencode-color-scheme") || "system"',
    replace: 'localStorage.getItem("opencode-color-scheme") || "light"',
    count: 1,
  },
  // 69-70. The dark canvas is hard-coded for first paint in the same two files
  { kind: "edit", file: `${UI}/theme/context.tsx`, find: 'isDark ? "#080808"', replace: 'isDark ? "#170a1d"', count: 2 },
  { kind: "edit", file: `${APP}/public/oc-theme-preload.js`, find: 'isDark ? "#080808"', replace: 'isDark ? "#170a1d"', count: 2 },
  { kind: "edit", file: `${APP}/index.html`, find: 'name="theme-color" content="#fafafa"', replace: 'name="theme-color" content="#f3eaf6"', count: 1 },

  // 31. Theme-picker label for the default theme
  { kind: "edit", file: `${UI}/theme/context.tsx`, find: '"oc-2": "OC-2"', replace: '"oc-2": "{{productName}}"', count: 1 },

  // 32-37. Favicons and install icons, generated by script/make-favicons.ts
  { kind: "dropin", file: `${FAVICON}/apple-touch-icon-v3.png`, source: "gui/favicon/apple-touch-icon-v3.png" },
  { kind: "dropin", file: `${FAVICON}/favicon-96x96-v3.png`, source: "gui/favicon/favicon-96x96-v3.png" },
  { kind: "dropin", file: `${FAVICON}/favicon-v3.ico`, source: "gui/favicon/favicon-v3.ico" },
  { kind: "dropin", file: `${FAVICON}/favicon-v3.svg`, source: "gui/favicon/favicon-v3.svg" },
  { kind: "dropin", file: `${FAVICON}/web-app-manifest-192x192.png`, source: "gui/favicon/web-app-manifest-192x192.png" },
  { kind: "dropin", file: `${FAVICON}/web-app-manifest-512x512.png`, source: "gui/favicon/web-app-manifest-512x512.png" },

  // 38. Every locale of the GUI. The brand name appears ~2,600 times across 63 locale files, so
  // this is a rule, not a list: every "OpenCode" except the third-party product names. minFiles
  // is what the test fixtures carry; upstream changes 63, and zero means the directory moved.
  {
    kind: "rule",
    files: `${APP}/src/i18n/*.ts`,
    skip: [".test.ts"],
    find: "OpenCode",
    replace: "{{productName}}",
    except: ["OpenCode Zen", "OpenCode Go"],
    minFiles: 3,
  },

  // ---------------------------------------------------------------------------
  // Desktop shell (packages/desktop): the Electron app around the graphical UI.
  // We only ever build the "prod" channel, so only its names are changed.
  // ---------------------------------------------------------------------------

  // 39-42. Packaging identity. The opencode:// scheme is kept so deep links keep working.
  {
    kind: "edit",
    file: `${DESKTOP}/electron-builder.config.ts`,
    find: 'productName: "OpenCode",',
    replace: 'productName: "{{productName}}",\n        copyright: "Copyright © OpenCode contributors, MIT License. Distributed by {{companyName}}.",',
    count: 1,
  },
  {
    kind: "edit",
    file: `${DESKTOP}/electron-builder.config.ts`,
    find: 'protocols: { name: "OpenCode", schemes: ["opencode"] },',
    replace: 'protocols: { name: "{{productName}}", schemes: ["{{productSlug}}"] },',
    count: 1,
  },
  { kind: "edit", file: `${DESKTOP}/electron-builder.config.ts`, find: 'prod: "ai.opencode.desktop",', replace: 'prod: "{{desktopAppId}}",', count: 1 },
  {
    kind: "edit",
    file: `${DESKTOP}/electron-builder.config.ts`,
    find: 'artifactName: "opencode-desktop-${os}-${arch}.${ext}",',
    replace: 'artifactName: "{{productSlug}}-desktop-${os}-${arch}.${ext}",',
    count: 1,
  },

  // 43-44. Runtime identity: app name (menus, Dock, data folder) and app id (settings folder).
  // Distinct from stock OpenCode Desktop, so both can be installed side by side.
  { kind: "edit", file: `${DESKTOP}/src/main/index.ts`, find: 'prod: "OpenCode",', replace: 'prod: "{{productName}}",', count: 1 },
  { kind: "edit", file: `${DESKTOP}/src/main/index.ts`, find: 'prod: "ai.opencode.desktop",', replace: 'prod: "{{desktopAppId}}",', count: 1 },

  // 45. Never self-update: upstream's feed is anomalyco's GitHub releases, which would replace
  // this app with stock OpenCode. New versions are delivered by IT until we publish our own feed.
  {
    kind: "edit",
    file: `${DESKTOP}/src/main/constants.ts`,
    find: 'export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev"',
    replace: "export const UPDATER_ENABLED = false",
    count: 1,
  },

  // 46-47. Window chrome
  { kind: "edit", file: `${DESKTOP}/src/main/windows.ts`, find: 'title: "OpenCode",', replace: 'title: "{{productName}}",', count: 1 },
  { kind: "edit", file: `${DESKTOP}/src/renderer/index.html`, find: "<title>OpenCode</title>", replace: "<title>{{productName}}</title>", count: 1 },

  // 48. The shell's own locale files (updater dialogs and the like), same rule as the GUI
  {
    kind: "rule",
    files: `${DESKTOP}/src/renderer/i18n/*.ts`,
    skip: [".test.ts"],
    find: "OpenCode",
    replace: "{{productName}}",
    except: ["OpenCode Zen", "OpenCode Go"],
    minFiles: 2,
  },

  // 49-56. App icons, generated by script/make-desktop-icons.ts
  ...["icon.icns", "icon.ico", "icon.png", "dock.png", "32x32.png", "64x64.png", "128x128.png", "128x128@2x.png"].map(
    (name): Transform => ({ kind: "dropin", file: `${DESKTOP_ICONS}/${name}`, source: `desktop/icons/${name}` }),
  ),

  // ---------------------------------------------------------------------------
  // Brand config names (behavioural, unlike everything above). ADDITIVE: every name and folder
  // upstream reads still works; simplify-code.json, .simplify-code/, ~/.config/simplify-code and the brand managed
  // locations are read as well, and merged later so they win. Verified end to end against the
  // real binary by script/e2e-config.ts, not only by string checks.
  // ---------------------------------------------------------------------------

  // 71. Brand names, folders and ordering helpers
  {
    kind: "edit",
    file: "packages/opencode/src/config/paths.ts",
    find: "import { FSUtil } from \"@opencode-ai/core/fs-util\"\n",
    replace: CONFIG_PATH_HELPERS,
    count: 1,
  },
  // 72. Project files: simplify-code.json(c) beside opencode.json(c). Upstream reversed the walk to get outer-first; with two name families the order is made explicit
  {
    kind: "edit",
    file: "packages/opencode/src/config/paths.ts",
    find: "    targets: [`${name}.jsonc`, `${name}.json`],\n    start: directory,\n    stop: worktree,\n  })).toReversed()",
    replace: "    targets: [`${name}.jsonc`, `${name}.json`, ...(name === \"opencode\" ? [`${BRAND}.jsonc`, `${BRAND}.json`] : [])],\n    start: directory,\n    stop: worktree,\n  })).toSorted(byPrecedence)",
    count: 1,
  },
  // 73. Per-project and home folders: .simplify-code beside .opencode
  {
    kind: "edit",
    file: "packages/opencode/src/config/paths.ts",
    find: "targets: [\".opencode\"],",
    replace: "targets: [\".opencode\", BRAND_DIR],",
    count: 2,
  },
  // 74-75. ~/.config/simplify-code beside ~/.config/opencode. Only when it exists: upstream writes a .gitignore into every listed folder and dies if it cannot
  {
    kind: "edit",
    file: "packages/opencode/src/config/paths.ts",
    find: "  return unique([\n    Global.Path.config,\n",
    replace: "  return brandFoldersLast(unique([\n    ...(upstreamGlobalInUse() ? [Global.Path.config] : []),\n    ...(existsSync(brandGlobalDir()) ? [brandGlobalDir()] : []),\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/config/paths.ts",
    find: "    ...(Flag.OPENCODE_CONFIG_DIR ? [Flag.OPENCODE_CONFIG_DIR] : []),\n  ])\n})",
    replace: "    ...(Flag.OPENCODE_CONFIG_DIR ? [Flag.OPENCODE_CONFIG_DIR] : []),\n    // {{productName}}: the company's team folders (shipped in the app, and the administrator's), read like any other config folder\n    ...ConfigManaged.teamConfigDirs(),\n  ]))\n})",
    count: 1,
  },
  // 76. The global file the app writes to: the first that exists, so an existing opencode.json keeps being used; a fresh install is seeded with ~/.config/simplify-code/simplify-code.jsonc
  {
    kind: "edit",
    file: "packages/opencode/src/config/config.ts",
    find: "  const candidates = [\"opencode.jsonc\", \"opencode.json\", \"config.json\"].map((file) =>\n    path.join(Global.Path.config, file),\n  )\n",
    replace: "  const candidates = [\n    ...ConfigPaths.fileInDirectory(ConfigPaths.brandGlobalDir(), ConfigPaths.BRAND).toReversed(),\n    ...ConfigPaths.fileInDirectory(ConfigPaths.brandGlobalDir(), \"opencode\").toReversed(),\n    ...[\"opencode.jsonc\", \"opencode.json\", \"config.json\"].map((file) => path.join(Global.Path.config, file)),\n  ]\n",
    count: 1,
  },
  // 77. Global config: upstream files first, then brand files
  {
    kind: "edit",
    file: "packages/opencode/src/config/config.ts",
    find: "      result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, \"opencode.jsonc\"), env))\n",
    replace: "      result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, \"opencode.jsonc\"), env))\n      // {{productName}}: brand names in upstream's folder, then BOTH name families in the brand folder, because\n      // `mv ~/.config/opencode ~/.config/{{productSlug}}` leaves a file still named opencode.json in there. Later wins.\n      for (const file of ConfigPaths.fileInDirectory(Global.Path.config, ConfigPaths.BRAND)) {\n        result = mergeConfig(result, yield* loadFile(file, env))\n      }\n      for (const name of [\"opencode\", ConfigPaths.BRAND]) {\n        for (const file of ConfigPaths.fileInDirectory(ConfigPaths.brandGlobalDir(), name)) {\n          result = mergeConfig(result, yield* loadFile(file, env))\n        }\n      }\n",
    count: 1,
  },
  // 78. Config files inside .opencode / .simplify-code folders
  {
    kind: "edit",
    file: "packages/opencode/src/config/config.ts",
    find: "          if (dir.endsWith(\".opencode\") || dir === Flag.OPENCODE_CONFIG_DIR) {\n            for (const file of [\"opencode.json\", \"opencode.jsonc\"]) {",
    replace: "          if (dir.endsWith(\".opencode\") || dir.endsWith(ConfigPaths.BRAND_DIR) || dir === Flag.OPENCODE_CONFIG_DIR || ConfigManaged.isTeamConfigDir(dir)) {\n            for (const file of [\"opencode.json\", \"opencode.jsonc\", `${ConfigPaths.BRAND}.json`, `${ConfigPaths.BRAND}.jsonc`]) {",
    count: 1,
  },
  // 79. Company-managed config: upstream's folder, then the brand's
  {
    kind: "edit",
    file: "packages/opencode/src/config/config.ts",
    find: "        const managedDir = ConfigManaged.managedConfigDir()\n        if (existsSync(managedDir)) {\n          for (const file of [\"opencode.json\", \"opencode.jsonc\"]) {\n            const source = path.join(managedDir, file)\n            yield* merge(source, yield* loadFile(source), \"global\")\n          }\n        }\n",
    replace: "        for (const managedDir of ConfigManaged.managedConfigDirs()) {\n          for (const file of [\"opencode.json\", \"opencode.jsonc\", `${ConfigPaths.BRAND}.json`, `${ConfigPaths.BRAND}.jsonc`]) {\n            const source = path.join(managedDir, file)\n            yield* merge(source, yield* loadFile(source), \"global\")\n          }\n        }\n",
    count: 1,
  },
  // 80-81. Managed folder /Library/Application Support/simplify-code (and the Windows and Linux equivalents), and the brand MDM preference domain, checked before upstream's
  {
    kind: "edit",
    file: "packages/opencode/src/config/managed.ts",
    find: "export function managedConfigDir() {\n  return process.env.OPENCODE_TEST_MANAGED_CONFIG_DIR || systemManagedConfigDir()\n}\n",
    replace: "export function managedConfigDir() {\n  return process.env.OPENCODE_TEST_MANAGED_CONFIG_DIR || systemManagedConfigDir()\n}\n\n/** {{productName}}: the brand's own managed folder beside upstream's, read after it so it wins. */\nexport function brandManagedConfigDir() {\n  return process.env.OPENCODE_TEST_BRAND_MANAGED_CONFIG_DIR || path.join(path.dirname(systemManagedConfigDir()), \"{{productSlug}}\")\n}\n\n/**\n * {{productName}}: the company set shipped INSIDE the desktop app (resources/company: the enforced config, the team\n * folder, an optional plugin-lock marker). The desktop main process points the server at it. Read as the\n * baseline, below the administrator folder, so one install gives every developer the same set and IT can\n * still override without a rebuild.\n */\nexport function bundledCompanyDir() {\n  return process.env.SIMPLIFY_CODE_BUNDLED_COMPANY_DIR || undefined\n}\n\n/** The folders whose config files are enforced, in merge order (later wins). */\nexport function managedConfigDirs() {\n  return [managedConfigDir(), bundledCompanyDir(), brandManagedConfigDir()].filter((dir): dir is string => !!dir && existsSync(dir))\n}\n\n/** The company folders an administrator or the build controls: bundled set, then the administrator folder. */\nfunction companyDirs() {\n  return [bundledCompanyDir(), brandManagedConfigDir()].filter((dir): dir is string => !!dir)\n}\n\n/**\n * {{productName}}: the company's shared agents, commands, skills, plugins and config. Inside the administrator\n * folder, so only an administrator can change it, yet read like any other config folder.\n */\nexport function brandTeamConfigDir() {\n  return process.env.OPENCODE_TEST_BRAND_TEAM_CONFIG_DIR || path.join(brandManagedConfigDir(), \"team\")\n}\n\n/** Every team folder to read, bundled first so the administrator's wins on conflicts; only those that exist. */\nexport function teamConfigDirs() {\n  const bundled = bundledCompanyDir()\n  return [...(bundled ? [path.join(bundled, \"team\")] : []), brandTeamConfigDir()].filter((dir) => existsSync(dir))\n}\n\nexport function isTeamConfigDir(dir: string) {\n  const bundled = bundledCompanyDir()\n  return dir === brandTeamConfigDir() || (!!bundled && dir === path.join(bundled, \"team\"))\n}\n\n/** {{productName}}: a marker file (in the bundled set or the administrator folder) that allows only administrator-declared plugins. */\nexport function pluginLockEnabled() {\n  return companyDirs().some((dir) => existsSync(path.join(dir, \"plugin-lock\")))\n}\n\n/** {{productName}}: a marker file (in the bundled set or the administrator folder) that allows only administrator-declared connectors. */\nexport function mcpLockEnabled() {\n  return companyDirs().some((dir) => existsSync(path.join(dir, \"mcp-lock\")))\n}\n\n/** Whether a config source is one only the build or an administrator writes: a managed folder, a company folder or an MDM profile. */\nexport function isAdminSource(source: string) {\n  if (source.startsWith(\"mobileconfig:\")) return true\n  const within = (dir: string) => source === dir || source.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep)\n  return [managedConfigDir(), ...companyDirs()].some(within)\n}\n\n/**\n * {{productName}}: the compiled terminal binary carries the company set too (script/build.ts embeds packages/opencode/company\n * as the virtual module company-set.gen.ts, the way upstream embeds its web UI). Extract it once per content hash into\n * the cache and point the loader at it. Other builds have no such module and skip this.\n */\nexport async function prepareBundledCompanySet() {\n  // already pointed somewhere by the desktop app, or explicitly switched off with an empty value (tests)\n  if (process.env.SIMPLIFY_CODE_BUNDLED_COMPANY_DIR !== undefined) return\n  // @ts-expect-error - virtual module provided by script/build.ts for the compiled binary only\n  const mod = await import(\"company-set.gen.ts\")\n    .then((m) => m as { default: Record<string, string>; hash: string })\n    .catch(() => null)\n  if (!mod || !mod.hash) return\n  const root = path.join(Global.Path.cache, \"company\")\n  const dir = path.join(root, mod.hash)\n  const marker = path.join(dir, \".complete\")\n  if (!existsSync(marker)) {\n    rmSync(dir, { recursive: true, force: true })\n    for (const [rel, embedded] of Object.entries(mod.default)) {\n      const target = path.join(dir, rel)\n      mkdirSync(path.dirname(target), { recursive: true })\n      writeFileSync(target, readFileSync(embedded))\n    }\n    writeFileSync(marker, mod.hash)\n    for (const entry of readdirSync(root)) if (entry !== mod.hash) rmSync(path.join(root, entry), { recursive: true, force: true })\n  }\n  process.env.SIMPLIFY_CODE_BUNDLED_COMPANY_DIR = dir\n}\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/config/managed.ts",
    find: "  const paths = [\n    path.join(\"/Library/Managed Preferences\", user, `${MANAGED_PLIST_DOMAIN}.plist`),",
    replace: "  const paths = [\n    path.join(\"/Library/Managed Preferences\", user, \"{{managedDomain}}.plist\"),\n    path.join(\"/Library/Managed Preferences\", \"{{managedDomain}}.plist\"),\n    path.join(\"/Library/Managed Preferences\", user, `${MANAGED_PLIST_DOMAIN}.plist`),",
    count: 1,
  },
  // 82-84. tui.json follows the same folders
  {
    kind: "edit",
    file: "packages/opencode/src/config/tui.ts",
    find: "const dirs = unique(directories).filter((dir) => dir.endsWith(\".opencode\") || dir === Flag.OPENCODE_CONFIG_DIR)",
    replace: "const dirs = unique(directories).filter(\n    (dir) =>\n      dir.endsWith(\".opencode\") || dir.endsWith(ConfigPaths.BRAND_DIR) || dir === Flag.OPENCODE_CONFIG_DIR || ConfigManaged.isTeamConfigDir(dir),\n  )",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/config/tui.ts",
    find: "if (!dir.endsWith(\".opencode\") && dir !== Flag.OPENCODE_CONFIG_DIR) continue",
    replace: "if (!dir.endsWith(\".opencode\") && !dir.endsWith(ConfigPaths.BRAND_DIR) && dir !== Flag.OPENCODE_CONFIG_DIR && !ConfigManaged.isTeamConfigDir(dir)) continue",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/config/tui.ts",
    find: "for (const file of ConfigPaths.fileInDirectory(Global.Path.config, \"tui\")) {",
    replace: "for (const file of [Global.Path.config, ConfigPaths.brandGlobalDir()].flatMap((dir) => ConfigPaths.fileInDirectory(dir, \"tui\"))) {",
    count: 1,
  },
  // 85-86. `opencode mcp add` edits whichever config exists, brand names first, and creates simplify-code.json when none does
  {
    kind: "edit",
    file: "packages/opencode/src/cli/cmd/mcp.ts",
    find: "  const candidates = [path.join(baseDir, \"opencode.json\"), path.join(baseDir, \"opencode.jsonc\")]",
    replace: "  const candidates = [path.join(baseDir, \"{{productSlug}}.json\"), path.join(baseDir, \"{{productSlug}}.jsonc\"), path.join(baseDir, \"opencode.json\"), path.join(baseDir, \"opencode.jsonc\")]",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/cli/cmd/mcp.ts",
    find: "candidates.push(path.join(baseDir, \".opencode\", \"opencode.json\"), path.join(baseDir, \".opencode\", \"opencode.jsonc\"))",
    replace: "candidates.push(\n      path.join(baseDir, \".{{productSlug}}\", \"{{productSlug}}.json\"),\n      path.join(baseDir, \".{{productSlug}}\", \"{{productSlug}}.jsonc\"),\n      path.join(baseDir, \".opencode\", \"opencode.json\"),\n      path.join(baseDir, \".opencode\", \"opencode.jsonc\"),\n    )",
    count: 1,
  },
  // 87. Upstream's new core reads the same names, so the lock survives its switch-over
  {
    kind: "edit",
    file: "packages/core/src/config.ts",
    find: "const names = [\"opencode.json\", \"opencode.jsonc\"]",
    replace: "const names = [\"opencode.json\", \"opencode.jsonc\", \"{{productSlug}}.json\", \"{{productSlug}}.jsonc\"]",
    count: 1,
  },

  // 109-111. Company control. paths.ts and tui.ts learn about the team folder; config.ts applies the
  // plugin lock once every source has been merged (the MDM profile is the last), so a developer's own
  // config can add plugins only while no administrator has created the marker.
  {
    kind: "edit",
    file: "packages/opencode/src/config/paths.ts",
    find: "import { Global } from \"@opencode-ai/core/global\"\n",
    replace: "import { Global } from \"@opencode-ai/core/global\"\nimport { ConfigManaged } from \"./managed\"\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/config/tui.ts",
    find: "import * as ConfigPaths from \"@/config/paths\"\n",
    replace: "import * as ConfigPaths from \"@/config/paths\"\nimport { ConfigManaged } from \"@/config/managed\"\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/config/config.ts",
    find: "        for (const [name, mode] of Object.entries(result.mode ?? {})) {\n          result.agent = mergeDeep(result.agent ?? {}, {\n",
    replace:
      "        // {{productName}}: with the plugin-lock marker in the managed folder, only administrator-declared plugins load.\n        if (ConfigManaged.pluginLockEnabled() && result.plugin_origins) {\n          const kept = result.plugin_origins.filter((item) => ConfigManaged.isAdminSource(item.source))\n          const dropped = result.plugin_origins.filter((item) => !kept.includes(item)).map((item) => item.spec)\n          if (dropped.length) yield* Effect.logWarning(\"plugin lock: ignoring plugins not declared by an administrator\", { dropped })\n          result.plugin_origins = kept\n          result.plugin = kept.map((item) => item.spec)\n        }\n\n        for (const [name, mode] of Object.entries(result.mode ?? {})) {\n          result.agent = mergeDeep(result.agent ?? {}, {\n",
    count: 1,
  },

  // 112. A developer who has not placed their gateway key yet must still be able to start the app: for
  // sources only an administrator writes, a missing {file:} reference resolves to empty (the gateway then
  // rejects requests with a clear authentication error). In a developer's own file it stays an error.
  {
    kind: "edit",
    file: "packages/opencode/src/config/config.ts",
    find: "            ? { text, type: \"path\", path: options.path, env }\n",
    replace: "            ? { text, type: \"path\", path: options.path, env, missing: ConfigManaged.isAdminSource(options.path) ? \"empty\" : \"error\" }\n",
    count: 1,
  },

  // 114-153. No traces of the upstream name on an installed machine: folders, command, help header,
  // user agent, messages that name the command, deep-link scheme, update feed file. Third-party service
  // names (OpenCode Zen, OpenCode Go) and the MIT licence are the deliberate exceptions.
  { kind: "edit", file: "packages/core/src/global.ts", find: 'const app = "opencode"', replace: 'const app = "{{productSlug}}"', count: 1 },
  { kind: "edit", file: "packages/core/src/database/database.ts", find: 'join(Global.Path.data, "opencode.db")', replace: 'join(Global.Path.data, "{{productSlug}}.db")', count: 1 },
  { kind: "edit", file: "packages/core/src/observability/logging.ts", find: 'path.join(Global.Path.log, "opencode.log")', replace: 'path.join(Global.Path.log, "{{productSlug}}.log")', count: 1 },
  { kind: "edit", file: "packages/opencode/script/build.ts", find: "outfile: `dist/${name}/bin/opencode`,", replace: "outfile: `dist/${name}/bin/{{productSlug}}`,", count: 1 },
  { kind: "edit", file: "packages/opencode/script/build.ts", find: "`--user-agent=opencode/${Script.version}`", replace: "`--user-agent={{productSlug}}/${Script.version}`", count: 1 },
  { kind: "edit", file: "packages/opencode/script/build.ts", find: "const binaryPath = `dist/${name}/bin/opencode`", replace: "const binaryPath = `dist/${name}/bin/{{productSlug}}`", count: 1 },
  { kind: "edit", file: "packages/opencode/src/index.ts", find: '.scriptName("opencode")', replace: '.scriptName("{{productSlug}}")', count: 1 },
  { kind: "edit", file: `${TUI}/util/error.ts`, find: "Try: `opencode models` to list available models", replace: "Try: `{{productSlug}} models` to list available models", count: 1 },
  { kind: "edit", file: `${TUI}/util/error.ts`, find: "Run \\`opencode auth login ${url}\\` to re-authenticate.", replace: "Run \\`{{productSlug}} auth login ${url}\\` to re-authenticate.", count: 1 },
  { kind: "edit", file: `${TUI}/util/error.ts`, find: "Note, opencode does not support MCP authentication yet.", replace: "Note, {{productName}} does not support MCP authentication yet.", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/error.ts", find: "Try: \\`opencode models\\` to list available models", replace: "Try: \\`{{productSlug}} models\\` to list available models", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/error.ts", find: "Run \\`opencode auth login ${url}\\` to re-authenticate.", replace: "Run \\`{{productSlug}} auth login ${url}\\` to re-authenticate.", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/error.ts", find: "Note, opencode does not support MCP authentication yet.", replace: "Note, {{productName}} does not support MCP authentication yet.", count: 1 },
  // Dynamic client registration for remote MCP connectors (e.g. Atlassian): this is what the third-party
  // server's own authorization page shows as the app the developer is signing in to. Left as "OpenCode"
  // it names someone else's product on our sign-in screen instead of ours.
  {
    kind: "edit",
    file: "packages/opencode/src/mcp/oauth-provider.ts",
    find: 'client_name: "OpenCode",\n      client_uri: "https://opencode.ai",',
    replace: 'client_name: "{{productName}}",\n      client_uri: "https://github.com/{{releaseRepo}}",',
    count: 1,
  },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/upgrade.ts", find: 'describe: "upgrade opencode to the latest or a specific version"', replace: 'describe: "upgrade {{productName}} to the latest or a specific version"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/upgrade.ts", find: "`opencode is installed to ${process.execPath}", replace: "`{{productName}} is installed to ${process.execPath}", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/upgrade.ts", find: "`opencode upgrade skipped: ${target}", replace: "`{{productSlug}} upgrade skipped: ${target}", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/serve.ts", find: 'describe: "starts a headless opencode server"', replace: 'describe: "starts a headless {{productName}} server"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/serve.ts", find: "`opencode server listening on http://", replace: "`{{productName}} server listening on http://", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/pr.ts", find: "`Found opencode session: ${sessionUrl}`", replace: "`Found {{productName}} session: ${sessionUrl}`", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/pr.ts", find: "`opencode exited with code ${code}`", replace: "`{{productName}} exited with code ${code}`", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/providers.ts", find: 'describe: "opencode auth provider"', replace: 'describe: "{{productSlug}} auth provider"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/debug/index.ts", find: "`opencode version: ${InstallationVersion}`", replace: "`{{productName}} version: ${InstallationVersion}`", count: 1 },
  // command descriptions shown by --help, and the server's mDNS domain and basic-auth username defaults
  { kind: "edit", file: "packages/opencode/src/cli/cmd/tui.ts", find: 'describe: "start opencode tui"', replace: 'describe: "start {{productName}} tui"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/tui.ts", find: 'describe: "path to start opencode in"', replace: 'describe: "path to start {{productName}} in"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/uninstall.ts", find: 'describe: "uninstall opencode and remove all related files"', replace: 'describe: "uninstall {{productName}} and remove all related files"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/pr.ts", find: 'describe: "fetch and checkout a GitHub PR branch, then run opencode"', replace: 'describe: "fetch and checkout a GitHub PR branch, then run {{productName}}"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/attach.ts", find: 'describe: "attach to a running opencode server"', replace: 'describe: "attach to a running {{productName}} server"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/attach.ts", find: "describe: \"basic auth username (defaults to OPENCODE_SERVER_USERNAME or 'opencode')\"", replace: "describe: \"basic auth username (defaults to OPENCODE_SERVER_USERNAME or '{{productSlug}}')\"", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/web.ts", find: 'describe: "start opencode server and open web interface"', replace: 'describe: "start {{productName}} server and open web interface"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/run.ts", find: 'describe: "run opencode with a message"', replace: 'describe: "run {{productName}} with a message"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/run.ts", find: 'describe: "attach to a running opencode server (e.g., http://localhost:4096)"', replace: 'describe: "attach to a running {{productName}} server (e.g., http://localhost:4096)"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/run.ts", find: "describe: \"basic auth username (defaults to OPENCODE_SERVER_USERNAME or 'opencode')\"", replace: "describe: \"basic auth username (defaults to OPENCODE_SERVER_USERNAME or '{{productSlug}}')\"", count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/cmd/run.ts", find: '    $0: "opencode",', replace: '    $0: "{{productSlug}}",', count: 1 },
  { kind: "edit", file: "packages/opencode/src/cli/network.ts", find: 'describe: "custom domain name for mDNS service (default: opencode.local)",\n    default: "opencode.local",', replace: 'describe: "custom domain name for mDNS service (default: {{productSlug}}.local)",\n    default: "{{productSlug}}.local",', count: 1 },
  { kind: "edit", file: "packages/opencode/src/server/mdns.ts", find: 'domain ?? "opencode.local"', replace: 'domain ?? "{{productSlug}}.local"', count: 1 },
  { kind: "edit", file: "packages/opencode/src/server/auth.ts", find: 'EffectConfig.withDefault("opencode")', replace: 'EffectConfig.withDefault("{{productSlug}}")', count: 1 },
  { kind: "edit", file: "packages/opencode/src/server/auth.ts", find: 'Flag.OPENCODE_SERVER_USERNAME ?? "opencode"', replace: 'Flag.OPENCODE_SERVER_USERNAME ?? "{{productSlug}}"', count: 1 },
  { kind: "edit", file: `${DESKTOP}/src/main/index.ts`, find: 'arg.startsWith("opencode://")', replace: 'arg.startsWith("{{productSlug}}://")', count: 1 },
  { kind: "edit", file: `${APP}/src/pages/layout/deep-links.ts`, find: 'input.startsWith("opencode://")', replace: 'input.startsWith("{{productSlug}}://")', count: 1 },
  // no publish config for prod: electron-builder would otherwise write resources/app-update.yml naming anomalyco's repo
  {
    kind: "edit",
    file: `${DESKTOP}/electron-builder.config.ts`,
    find: '        publish: { provider: "github", owner: "anomalyco", repo: "opencode", channel: "latest" },\n',
    replace: "",
    count: 1,
  },

  // 154-155. The company set shipped inside the desktop app: packages/desktop/company/ (copied in by the
  // build) becomes resources/company, and the desktop main process tells its server where it is.
  {
    kind: "edit",
    file: `${DESKTOP}/src/main/index.ts`,
    find: '  process.env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = "true"\n',
    replace: '  process.env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = "true"\n  // {{productName}}: the company set (enforced config, team folder) travels inside the app; the server reads it as the baseline\n  if (app.isPackaged) process.env.SIMPLIFY_CODE_BUNDLED_COMPANY_DIR = join(process.resourcesPath, "company")\n',
    count: 1,
  },
  {
    kind: "edit",
    file: `${DESKTOP}/electron-builder.config.ts`,
    find: '    {\n      from: "native/",\n      to: "native/",\n',
    replace: '    { from: "company/", to: "company/" },\n    {\n      from: "native/",\n      to: "native/",\n',
    count: 1,
  },

  // 156-162. The terminal binary carries the company set too. build.ts embeds packages/opencode/company (staged by
  // the pipeline) as a virtual module, exactly like upstream's web UI; managed.ts extracts it at start.
  {
    kind: "edit",
    file: "packages/opencode/src/config/managed.ts",
    find: 'import { existsSync } from "fs"\n',
    replace: 'import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs"\nimport { Global } from "@opencode-ai/core/global"\n',
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/script/build.ts",
    find: "const embeddedFileMap = skipEmbedWebUi ? null : await createEmbeddedWebUIBundle()\n",
    replace:
      "const embeddedFileMap = skipEmbedWebUi ? null : await createEmbeddedWebUIBundle()\n\n" +
      "// {{productName}}: the company set (enforced config, team folder), staged by the overlay pipeline into ./company, travels\n" +
      "// inside the binary the same way as the web UI. Absent folder: nothing embedded.\n" +
      "const createEmbeddedCompanyBundle = async () => {\n" +
      '  const company = path.join(dir, "company")\n' +
      "  if (!(await Bun.file(path.join(company, \"{{productSlug}}.jsonc\")).exists())) return null\n" +
      '  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: company, dot: true })))\n' +
      '    .map((file) => file.replaceAll("\\\\", "/"))\n' +
      '    .filter((file) => !file.includes("/.bin/"))\n' +
      "    .sort()\n" +
      "  const hasher = new Bun.CryptoHasher(\"sha256\")\n" +
      "  for (const file of files) hasher.update(file).update(await Bun.file(path.join(company, file)).arrayBuffer())\n" +
      "  const imports = files.map((file, i) => `import file_${i} from ${JSON.stringify(`./company/${file}`)} with { type: \"file\" };`)\n" +
      "  const entries = files.map((file, i) => `  ${JSON.stringify(file)}: file_${i},`)\n" +
      "  return [...imports, `export const hash = ${JSON.stringify(hasher.digest(\"hex\").slice(0, 16))};`, `export default {`, ...entries, `}`].join(\"\\n\")\n" +
      "}\n" +
      "const embeddedCompanyMap = await createEmbeddedCompanyBundle()\n" +
      "console.log(embeddedCompanyMap ? `Embedding the company set into the binary` : `No company set to embed`)\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/script/build.ts",
    find: '      ...(embeddedFileMap ? { "opencode-web-ui.gen.ts": embeddedFileMap } : {}),\n',
    replace: '      ...(embeddedFileMap ? { "opencode-web-ui.gen.ts": embeddedFileMap } : {}),\n      ...(embeddedCompanyMap ? { "company-set.gen.ts": embeddedCompanyMap } : {}),\n',
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/script/build.ts",
    find: '      ...(embeddedFileMap ? ["opencode-web-ui.gen.ts"] : []),\n',
    replace: '      ...(embeddedFileMap ? ["opencode-web-ui.gen.ts"] : []),\n      ...(embeddedCompanyMap ? ["company-set.gen.ts"] : []),\n',
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/script/build-node.ts",
    find: '    "opencode-web-ui.gen.ts": "",\n',
    replace: '    "opencode-web-ui.gen.ts": "",\n    "company-set.gen.ts": "",\n',
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/index.ts",
    find: 'import { Heap } from "./cli/heap"\n',
    replace: 'import { Heap } from "./cli/heap"\nimport { ConfigManaged } from "./config/managed"\n',
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/index.ts",
    find: "const cli = yargs(args)\n",
    replace: "// {{productName}}: the company set embedded in this binary becomes the config baseline (no-op in other builds)\nawait ConfigManaged.prepareBundledCompanySet()\n\nconst cli = yargs(args)\n",
    count: 1,
  },

  // 163. Connector lock, part 1: while merging, remember which connectors (config key `mcp`) an administrator declared.
  // Deep-merged among administrator sources so a hot-fix in the administrator folder can adjust a bundled connector.
  {
    kind: "edit",
    file: "packages/opencode/src/config/config.ts",
    find: "        const merge = (source: string, next: Info, kind?: ConfigPlugin.Scope) => {\n          result = mergeConfigConcatArrays(result, next)\n          return mergePluginOrigins(source, next.plugin, kind)\n        }\n",
    replace:
      "        // {{productName}}: connectors declared by an administrator source, for the connector lock below\n" +
      "        const adminMcp: Record<string, any> = {}\n" +
      "        // ...and the permission rules an administrator declared: they are re-applied last, below\n" +
      "        const adminPermission: Record<string, any> = {}\n" +
      "        const merge = (source: string, next: Info, kind?: ConfigPlugin.Scope) => {\n" +
      "          result = mergeConfigConcatArrays(result, next)\n" +
      "          if (next.mcp && ConfigManaged.isAdminSource(source)) {\n" +
      "            for (const [name, def] of Object.entries(next.mcp)) adminMcp[name] = mergeDeep((adminMcp[name] ?? {}) as any, def as any)\n" +
      "          }\n" +
      "          if (isRecord(next.permission) && ConfigManaged.isAdminSource(source)) {\n" +
      "            for (const [key, value] of Object.entries(next.permission)) {\n" +
      "              adminPermission[key] = isRecord(value) ? mergeDeep((adminPermission[key] ?? {}) as any, value as any) : value\n" +
      "            }\n" +
      "          }\n" +
      "          return mergePluginOrigins(source, next.plugin, kind)\n" +
      "        }\n",
    count: 1,
  },
  // 164. Connector lock, part 2: after every source has merged, only administrator-declared connectors remain, and
  // their definitions REPLACE whatever else was merged, so a developer cannot add a url or headers to one.
  {
    kind: "edit",
    file: "packages/opencode/src/config/config.ts",
    find: "        for (const [name, mode] of Object.entries(result.mode ?? {})) {\n          result.agent = mergeDeep(result.agent ?? {}, {\n",
    replace:
      "        // {{productName}}: the last matching permission rule wins, and a key that exists in both a developer's file and an\n" +
      "        // administrator's keeps the developer's EARLIER position, so a narrower allow written after it would beat the\n" +
      "        // administrator's ask. Re-append the administrator's rules so they are always the last.\n" +
      "        if (isRecord(result.permission)) {\n" +
      "          for (const [key, value] of Object.entries(adminPermission)) {\n" +
      "            delete result.permission[key]\n" +
      "            result.permission[key] = value\n" +
      "          }\n" +
      "        }\n\n" +
      "        // {{productName}}: with the mcp-lock marker, only administrator-declared connectors load, exactly as declared.\n" +
      "        if (ConfigManaged.mcpLockEnabled()) {\n" +
      "          const dropped = Object.keys(result.mcp ?? {}).filter((name) => !(name in adminMcp))\n" +
      "          if (dropped.length) yield* Effect.logWarning(\"connector lock: ignoring connectors not declared by an administrator\", { dropped })\n" +
      "          result.mcp = adminMcp\n" +
      "        }\n\n" +
      "        for (const [name, mode] of Object.entries(result.mode ?? {})) {\n          result.agent = mergeDeep(result.agent ?? {}, {\n",
    count: 1,
  },

  // 165-172. The "+" menu under the chat box lists the company connectors (MCP servers), like Claude's. The add menu is a
  // generic component in session-ui with no access to app state, so it takes an optional list; the app composer builds it
  // from the live connector state and the same toggle the /mcp dialog uses (which starts OAuth sign-in when needed).
  {
    kind: "edit",
    file: "packages/session-ui/src/v2/components/prompt-input/index.tsx",
    find: "  attachKeybind?: string[]\n  attachShortcut?: string\n}\n\nexport function PromptInputV2(props: PromptInputV2Props) {\n",
    replace:
      "  attachKeybind?: string[]\n  attachShortcut?: string\n  /** {{productName}}: the company connectors, listed in the add menu. Supplied by the app; absent means no group. */\n  connectors?: PromptInputV2Connectors\n}\n\n" +
      "/** {{productName}}: one connector (an MCP server) as the add menu shows it. */\n" +
      "export interface PromptInputV2ConnectorItem {\n  id: string\n  name: string\n  /** connected, disabled, pending, failed, needs_auth or needs_client_registration */\n  status: string\n}\n\n" +
      "export interface PromptInputV2Connectors {\n  label: string\n  items: () => PromptInputV2ConnectorItem[]\n  statusLabel: (status: string) => string | undefined\n  onToggle: (id: string) => void\n}\n\n" +
      "export function PromptInputV2(props: PromptInputV2Props) {\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/session-ui/src/v2/components/prompt-input/index.tsx",
    find: "              onShell={props.controller.openShell}\n            />\n",
    replace: "              onShell={props.controller.openShell}\n              connectors={props.connectors}\n            />\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/session-ui/src/v2/components/prompt-input/index.tsx",
    find: "  onContext: () => void\n  onShell: () => void\n}) {\n",
    replace: "  onContext: () => void\n  onShell: () => void\n  connectors?: PromptInputV2Connectors\n}) {\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/session-ui/src/v2/components/prompt-input/index.tsx",
    find: '            <MenuV2.Item onSelect={props.onShell} shortcut="!">\n              {props.shellLabel}\n            </MenuV2.Item>\n',
    replace:
      '            <MenuV2.Item onSelect={props.onShell} shortcut="!">\n              {props.shellLabel}\n            </MenuV2.Item>\n' +
      "            {/* {{productName}}: company connectors. Connected and switched-off ones are checkbox rows; the rest (sign in, failed) are plain rows with a badge. */}\n" +
      "            <Show when={(props.connectors?.items().length ?? 0) > 0}>\n" +
      "              <MenuV2.Separator />\n" +
      "              <MenuV2.Group>\n" +
      "                <MenuV2.GroupLabel>{props.connectors!.label}</MenuV2.GroupLabel>\n" +
      "                <For each={props.connectors!.items()}>\n" +
      "                  {(item) => (\n" +
      "                    <Show\n" +
      '                      when={item.status === "connected" || item.status === "disabled"}\n' +
      "                      fallback={\n" +
      "                        <MenuV2.Item\n" +
      "                          data-connector={item.id}\n" +
      "                          data-status={item.status}\n" +
      '                          disabled={item.status === "pending" || item.status === "unavailable"}\n' +
      "                          badge={props.connectors!.statusLabel(item.status)}\n" +
      "                          onSelect={() => props.connectors!.onToggle(item.id)}\n" +
      "                        >\n" +
      "                          {item.name}\n" +
      "                        </MenuV2.Item>\n" +
      "                      }\n" +
      "                    >\n" +
      "                      <MenuV2.CheckboxItem\n" +
      "                        data-connector={item.id}\n" +
      "                        data-status={item.status}\n" +
      '                        checked={item.status === "connected"}\n' +
      "                        onChange={() => props.connectors!.onToggle(item.id)}\n" +
      "                      >\n" +
      "                        {item.name}\n" +
      "                      </MenuV2.CheckboxItem>\n" +
      "                    </Show>\n" +
      "                  )}\n" +
      "                </For>\n" +
      "              </MenuV2.Group>\n" +
      "            </Show>\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/app/src/components/prompt-input-v2.tsx",
    find: 'import { useSync } from "@/context/sync"\n',
    replace: 'import { useSync } from "@/context/sync"\nimport { useMcpToggle } from "@/context/mcp"\n',
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/app/src/components/prompt-input-v2.tsx",
    find: "export function PromptInputV2Composer(props: PromptInputV2ComposerProps) {\n  const dialog = useDialog()\n  const command = useCommand()\n  const language = useLanguage()\n",
    replace:
      "export function PromptInputV2Composer(props: PromptInputV2ComposerProps) {\n  const dialog = useDialog()\n  const command = useCommand()\n  const language = useLanguage()\n\n" +
      "  // {{productName}}: the connector catalog for the \"+\" menu. Every known connector is listed, whether or not\n" +
      "  // the company has shipped it yet, so developers can see what is coming; live status comes from the /mcp state.\n" +
      "  const connectorSync = useSync()\n" +
      "  const connectorToggle = useMcpToggle()\n" +
      "  const CONNECTOR_CATALOG: Record<string, string> = {\n" +
      '    atlassian: "Atlassian (Jira, Confluence)",\n    slack: "Slack",\n    "azure-devops": "Azure DevOps",\n    salesforce: "Salesforce",\n    servicenow: "ServiceNow",\n    outlook: "Outlook",\n  }\n' +
      "  const connectorName = (id: string) =>\n" +
      '    CONNECTOR_CATALOG[id] ?? id.split(/[-_]/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")\n' +
      "  const connectorStatusKeys: Record<string, string> = {\n" +
      '    connected: "mcp.status.connected",\n    failed: "mcp.status.failed",\n    needs_auth: "mcp.status.needs_auth",\n    needs_client_registration: "mcp.status.needs_client_registration",\n    disabled: "mcp.status.disabled",\n    unavailable: "prompt.action.connectors.unavailable",\n  }\n' +
      '  const connectorStatus = (id: string) => connectorSync().data.mcp?.[id]?.status ?? "unavailable"\n' +
      "  const connectors = {\n" +
      '    label: language.t("prompt.action.connectors"),\n' +
      "    items: () => {\n" +
      "      const liveMcp = connectorSync().data.mcp ?? {}\n" +
      "      const ids = new Set([...Object.keys(CONNECTOR_CATALOG), ...Object.keys(liveMcp)])\n" +
      "      return [...ids]\n" +
      "        .map((id) => ({ id, name: connectorName(id), status: connectorStatus(id) }))\n" +
      "        .sort((a, b) => a.name.localeCompare(b.name))\n" +
      "    },\n" +
      "    statusLabel: (status: string) => (connectorStatusKeys[status] ? language.t(connectorStatusKeys[status] as never) : undefined),\n" +
      "    onToggle: (id: string) => {\n" +
      '      if (connectorStatus(id) === "unavailable") return\n' +
      "      if (!connectorToggle.isPending) connectorToggle.mutate(id)\n" +
      "    },\n" +
      "  }\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/app/src/components/prompt-input-v2.tsx",
    find: '        attachShortcut={command.keybind("file.attach")}\n',
    replace: '        attachShortcut={command.keybind("file.attach")}\n        connectors={connectors}\n',
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/app/src/i18n/en.ts",
    find: '  "prompt.action.attachFile": "Add files",\n',
    replace: '  "prompt.action.attachFile": "Add files",\n  "prompt.action.connectors": "Connectors",\n  "prompt.action.connectors.unavailable": "Not enabled yet",\n',
    count: 1,
  },

  // ---------------------------------------------------------------------------
  // Where NEW files are created. Same principle as the config file: an existing .opencode folder keeps
  // being used (so one project is never split across two folders); everything new gets the brand name.
  // The rule is ConfigPaths.writeDirIn / writeGlobalDir, part of CONFIG_PATH_HELPERS above.
  // ---------------------------------------------------------------------------

  // 88-89. `opencode agent create`
  {
    kind: "edit",
    file: "packages/opencode/src/cli/cmd/agent.ts",
    find: "import { Global } from \"@opencode-ai/core/global\"\nimport path from \"path\"\n",
    replace: "import { Global } from \"@opencode-ai/core/global\"\nimport { ConfigPaths } from \"@/config/paths\"\nimport path from \"path\"\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/cli/cmd/agent.ts",
    find: "targetPath = path.join(scope === \"global\" ? Global.Path.config : path.join(ctx.worktree, \".opencode\"), \"agents\")",
    replace: "targetPath = path.join(scope === \"global\" ? ConfigPaths.writeGlobalDir() : ConfigPaths.writeDirIn(ctx.worktree), \"agents\")",
    count: 1,
  },
  // 90-93. Plan files. Plan mode denies every edit except the plans folder, so the brand folder needs its own allow rule in both engines; upstream's rule is kept
  {
    kind: "edit",
    file: "packages/opencode/src/session/session.ts",
    find: "import { Global } from \"@opencode-ai/core/global\"\n",
    replace: "import { Global } from \"@opencode-ai/core/global\"\nimport { ConfigPaths } from \"@/config/paths\"\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/session/session.ts",
    find: "    ? path.join(instance.worktree, \".opencode\", \"plans\")",
    replace: "    ? path.join(ConfigPaths.writeDirIn(instance.worktree), \"plans\")",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/agent/agent.ts",
    find: "                  [path.join(\".opencode\", \"plans\", \"*.md\")]: \"allow\",\n",
    replace: "                  [path.join(\".opencode\", \"plans\", \"*.md\")]: \"allow\",\n                  [path.join(\".{{productSlug}}\", \"plans\", \"*.md\")]: \"allow\",\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/core/src/plugin/agent.ts",
    find: "            { action: \"edit\", resource: path.join(\".opencode\", \"plans\", \"*.md\"), effect: \"allow\" },\n",
    replace: "            { action: \"edit\", resource: path.join(\".opencode\", \"plans\", \"*.md\"), effect: \"allow\" },\n            { action: \"edit\", resource: path.join(\".{{productSlug}}\", \"plans\", \"*.md\"), effect: \"allow\" },\n",
    count: 1,
  },
  // 94-96. Plugin install: which folder, and which file in it (an existing file of either name, else the brand name)
  {
    kind: "edit",
    file: "packages/opencode/src/plugin/install.ts",
    find: "  if (input.global) return input.config ?? Global.Path.config\n",
    replace: "  if (input.global) return input.config ?? ConfigPaths.writeGlobalDir()\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/plugin/install.ts",
    find: "  return path.join(root, \".opencode\")\n",
    replace: "  return ConfigPaths.writeDirIn(root)\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/plugin/install.ts",
    find: "  const files = dep.files(dir, name)\n",
    replace: "  const files = name === \"opencode\" ? [...dep.files(dir, ConfigPaths.BRAND), ...dep.files(dir, name)] : dep.files(dir, name)\n",
    count: 1,
  },
  // 97-100. Themes installed by TUI plugins, and the tui.json a plugin falls back to
  {
    kind: "edit",
    file: "packages/opencode/src/plugin/tui/runtime.ts",
    find: "import { Global } from \"@opencode-ai/core/global\"\n",
    replace: "import { Global } from \"@opencode-ai/core/global\"\nimport { ConfigPaths } from \"@/config/paths\"\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/plugin/tui/runtime.ts",
    find: "      path.basename(source_dir) === \".opencode\"\n        ? path.join(source_dir, \"themes\")\n        : path.join(source_dir, \".opencode\", \"themes\")\n",
    replace: "      [\".opencode\", ConfigPaths.BRAND_DIR].includes(path.basename(source_dir))\n        ? path.join(source_dir, \"themes\")\n        : path.join(ConfigPaths.writeDirIn(source_dir), \"themes\")\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/plugin/tui/runtime.ts",
    find: "path.join(Global.Path.config, \"themes\")",
    replace: "path.join(ConfigPaths.writeGlobalDir(), \"themes\")",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/plugin/tui/runtime.ts",
    find: "path.join(state.directory, \".opencode\", \"tui.json\")",
    replace: "path.join(ConfigPaths.writeDirIn(state.directory), \"tui.json\")",
    count: 1,
  },
  // 101-102. Custom themes are discovered in the brand folders too (the TUI package cannot import ConfigPaths)
  {
    kind: "edit",
    file: "packages/tui/src/context/theme.tsx",
    find: "    const directories = [Global.Path.config]\n",
    replace: "    const directories = [Global.Path.config, path.join(path.dirname(Global.Path.config), \"{{productSlug}}\")]\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/tui/src/context/theme.tsx",
    find: "      directories.push(path.join(current, \".opencode\"))\n",
    replace: "      directories.push(path.join(current, \".opencode\"), path.join(current, \".{{productSlug}}\"))\n",
    count: 1,
  },
  // 103. Home-screen tips that tell people where to put files
  {
    kind: "rule",
    files: "packages/tui/src/feature-plugins/home/tips-view.tsx",
    find: ".opencode/",
    replace: ".{{productSlug}}/",
    except: [],
    minFiles: 1,
  },
  // 104-106. The built-in skill the model follows when asked to create agents, commands or skills: a preface, not a rewrite, and descriptions that also trigger on the brand names
  {
    kind: "edit",
    file: "packages/core/src/plugin/skill/customize-opencode.md",
    find: "# Customizing opencode\n",
    replace: "# Customizing opencode\n\n> **This build is {{productName}}.** When creating or editing configuration, prefer the {{productName}} names:\n> `{{productSlug}}.json` / `{{productSlug}}.jsonc`, a `.{{productSlug}}/` folder in a project, and `~/.config/{{productSlug}}/`\n> globally. Every `opencode` name below is still read, so leave existing `opencode.json` files and\n> `.opencode/` folders where they are and add to them rather than creating a second folder beside\n> them. Where both exist, the {{productName}} one wins. The schema URL stays `https://opencode.ai/config.json`.\n",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/core/src/plugin/skill.ts",
    find: "files under .opencode/, or files under ~/.config/opencode/.",
    replace: "files under .opencode/, or files under ~/.config/opencode/ (in this build also {{productSlug}}.json, {{productSlug}}.jsonc, files under .{{productSlug}}/ or ~/.config/{{productSlug}}/).",
    count: 1,
  },
  {
    kind: "edit",
    file: "packages/opencode/src/skill/index.ts",
    find: "files under .opencode/, or files under ~/.config/opencode/.",
    replace: "files under .opencode/, or files under ~/.config/opencode/ (in this build also {{productSlug}}.json, {{productSlug}}.jsonc, files under .{{productSlug}}/ or ~/.config/{{productSlug}}/).",
    count: 1,
  },
  // 108. Publisher. electron-builder takes CompanyName (Windows file properties, Add or remove
  // programs) and the default copyright line from package.json's author. The company distributes the
  // app, so it is the publisher; the copyright stays upstream's, whose MIT-licensed code this is.
  { kind: "json", file: `${DESKTOP}/package.json`, set: { "author.name": "{{companyName}}" } },
  // 113. The Windows per-user install folder. electron-builder names a one-click installer's folder after the
  // PACKAGE name, sanitised (%LOCALAPPDATA%\Programs\@opencode-aidesktop), not after productName. Only the
  // lockfile knows this name and nothing imports the package, and the build never reinstalls after transforms.
  { kind: "json", file: `${DESKTOP}/package.json`, set: { name: "{{productSlug}}-desktop" } },
  // 107. Cross-building the desktop app. Upstream bakes the HOST's terminal module
  // (@lydell/node-pty-<platform>-<arch>) into the app, which is right on its per-OS CI runners and
  // wrong when one Mac builds the Intel-Mac and Windows apps too. Unset, behaviour is upstream's.
  {
    kind: "edit",
    file: `${DESKTOP}/electron.vite.config.ts`,
    find: "const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`",
    replace:
      "const nodePtyPkg = `@lydell/node-pty-${process.env.OVERLAY_TARGET_PLATFORM ?? process.platform}-${process.env.OVERLAY_TARGET_ARCH ?? process.arch}`",
    count: 1,
  },
]

/** Every upstream file targeted by name, root-relative. */
export const UPSTREAM_FILES: string[] = [...new Set(TRANSFORMS.flatMap((t) => (t.kind === "rule" ? [] : [t.file])))]

/** Globs rewritten by rule transforms. */
export const UPSTREAM_RULES: string[] = TRANSFORMS.flatMap((t) => (t.kind === "rule" ? [t.files] : []))

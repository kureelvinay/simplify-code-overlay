# XCode Rebrand Overlay — Design

**Date:** 2026-09-17
**Status:** Approved in discussion, pending written review
**Upstream:** [anomalyco/opencode](https://github.com/anomalyco/opencode), baseline tag `v1.18.31`

## 1. Goal

Ship OpenCode to SimplifyX developers as **XCode by SimplifyX**: the same tool, with the SimplifyX color palette, an XCode logo, XCode wording on screen, and an upgrader that pulls from the internal registry. Keep the rebrand small enough that every upstream release (currently two or three a week) can be rebranded, built, and published automatically within an hour, with no manual merging.

The first deliverable is a **local build installed on one developer's Mac** (the requester's), replacing the stock `opencode-ai@1.18.29` install. Mass rollout through the internal npm registry follows once that looks right.

### Non-goals

- Renaming the `opencode` command, `OPENCODE_*` environment variables, provider ids, plugin APIs, or the HTTP server, or *removing* any config name or folder upstream reads. Upstream documentation must keep applying verbatim. (Brand config names were **added** alongside upstream's on 2026-09-21, see Section 4.4.)
- Rebranding the VS Code extension or the share pages. (The shared graphical UI, `packages/app` and `packages/ui`, was brought into scope on 2026-09-18, see Section 4.2. Packaging the Electron desktop shell around it is the next stage and is not covered here yet.)
- Windows code signing and macOS notarization. The binaries install through npm, which does not set the macOS quarantine attribute, so Gatekeeper does not block them. Signing is a later IT task and this design leaves a hook for it (Section 7).
- A centrally managed `opencode.json` (share disabled, providers locked to the company AI gateway). That is pure configuration, independent of this pipeline, and is a follow-up project.
- Maintaining a long-lived fork branch. There is no fork. The overlay repo contains only brand assets and scripts.

### Naming note

"XCode" is one letter from Apple's Xcode, which developers will see on the same Mac. The requester has chosen the name knowingly. To avoid a path collision with Apple's tooling the command stays `opencode`, and no `xcode` alias is added.

## 2. Brand inputs

Palette taken from the CSS custom properties on simplifyx.com on 2026-09-17.

| Role | Hex | Site source |
|---|---|---|
| Primary purple | `#7d2b8c` | `--_colors---accent` |
| Deep purple | `#51115c` | `--cta-bg-color` |
| Navy (light-mode text, dark-mode surface) | `#1f242d` | `--_colors---secondary` |
| Teal | `#4de8f9` | `--_colors---teal` |
| Blue | `#1863dc` | button backgrounds |
| Light purple tint | `#eadced` | card backgrounds |
| Gray | `#4f5766` | `--_colors---accent-gray` |

Product strings:

| Key | Value |
|---|---|
| `productName` | `XCode` |
| `tagline` | `by SimplifyX` |
| `npmScope` | `@simplifyx` |
| `npmPackage` | `@simplifyx/xcode` |
| `releaseRepo` | placeholder `simplifyx/xcode-releases`, internal GitHub repo that receives binary releases |

All of these live in `brand/brand.json` and nowhere else. Changing the brand later means editing that folder, not the scripts.

## 3. Repository layout

```
xcode-overlay/
  brand/
    brand.json          product strings, package names, release repo
    theme.json          full TUI theme in OpenCode's defs/theme JSON format
    logo.ts             glyph arrays, drop-in replacement for upstream logo.ts
  src/
    brand.ts            loads and validates brand.json
    transforms.ts       the ordered list of transforms (data, not logic)
    rebrand.ts          clones an upstream tag and applies transforms
    package.ts          turns upstream dist/ into scoped npm packages
    pipeline.ts         CLI entry: full run, --local, --check
  test/
    fixtures/upstream/  copies, at v1.18.31, of the fourteen upstream files the
                        transforms touch, plus upstream's postinstall.mjs for package tests
    transforms.test.ts
    package.test.ts
  .github/workflows/
    rebrand.yml         thin wrapper around pipeline.ts
  docs/superpowers/specs/
  package.json          bun scripts: test, pipeline
  README.md
```

The overlay never contains OpenCode source. Upstream is cloned into a git-ignored `work/` directory at run time.

## 4. Transform engine

Four transform kinds. The first two carried the terminal UI; `json` and `rule` were added for the graphical UI (Section 4.2):

- **Drop-in.** Overwrite a whole upstream file with a file from `brand/`. Used where we own the entire content.
- **Asserted edit.** Replace an exact string in an upstream file. The engine reads the file, checks that the anchor string occurs exactly the expected number of times, replaces it, and writes. **If the count differs, the run stops** with the file path, the anchor, the expected count, and the actual count. Nothing is built or published.
- **Json.** Set values at dot paths in an upstream JSON file. **Every path must already exist upstream**, so a renamed or removed key stops the run instead of being silently re-added, while keys upstream adds later flow through untouched. Used for theme files that are mostly upstream's and only partly ours.
- **Rule.** In every file matching a glob, replace each occurrence of a token that is not part of a protected phrase; **at least `minFiles` files must change**. Used where the text is too repetitive to list anchor by anchor. Drop-ins also copy binary brand files byte for byte.

There are no `.patch` files and no fuzzy matching. A missing anchor is the drift signal: it tells the maintainer exactly which upstream change to look at, and the fix is a one-line edit to `src/transforms.ts`.

`transforms.ts` is a plain array so the test suite and the pipeline share one definition:

```ts
type Transform =
  | { kind: "dropin"; file: string; source: string }
  | { kind: "edit"; file: string; find: string; replace: string; count: number }
  | { kind: "json"; file: string; set: Record<string, string> }
  | { kind: "rule"; files: string; skip?: string[]; find: string; replace: string; except: string[]; minFiles: number }
```

`replace` may contain `{{productName}}`, `{{tagline}}`, `{{npmPackage}}`, `{{npmPackageEncoded}}` (the package name with `/` encoded as `%2F`, derived, not stored), and `{{releaseRepo}}` placeholders, filled from `brand.json` before application.

### 4.1 Transform list (against v1.18.31)

Paths are relative to the upstream repo root.

| # | File | Kind | Anchor / source | Count | Effect |
|---|---|---|---|---|---|
| 1 | `packages/tui/src/logo.ts` | drop-in | `brand/logo.ts` | – | XCode glyphs |
| 2 | `packages/tui/src/theme/assets/opencode.json` | drop-in | `brand/theme.json` | – | Brand palette becomes the embedded default theme; `/theme` still lists it as `opencode` so existing `tui.json` files keep working |
| 3 | `packages/tui/src/component/logo.tsx` | edit | `renderLine(line, theme.textMuted, false)` → `renderLine(line, theme.primary, false)` | 1 | Left block (the X) in brand purple |
| 4 | `packages/tui/src/component/logo.tsx` | edit | closing `</For>` followed by `</box>` → same, with a tagline `<text fg={theme.textMuted}>` row inserted before `</box>` | 1 | "by SimplifyX" under the logo |
| 5 | `packages/tui/src/app.tsx` | edit | `renderer.setTerminalTitle("OpenCode")` → `("{{productName}}")` | 2 | Terminal title |
| 6 | `packages/tui/src/app.tsx` | edit | `Successfully updated to OpenCode v` → `Successfully updated to {{productName}} v` | 1 | Update toast |
| 7 | `packages/tui/src/attention.ts` | edit | `name: "OpenCode Default"` → `name: "{{productName}} Default"` | 1 | Notification profile name |
| 8 | `packages/tui/src/feature-plugins/home/tips-view.tsx` | edit | `prevent OpenCode from reading` → `prevent {{productName}} from reading` | 1 | Home-screen tip |
| 9 | `packages/tui/src/feature-plugins/home/tips-view.tsx` | edit | `headless API access to OpenCode` → `headless API access to {{productName}}` | 1 | Home-screen tip |
| 10 | `packages/tui/src/routes/session/permission.tsx` | edit | `until OpenCode is restarted` → `until {{productName}} is restarted` | 2 | Permission dialog |
| 11 | `packages/tui/src/routes/session/permission.tsx` | edit | `Tell OpenCode what to do differently` → `Tell {{productName}} what to do differently` | 1 | Permission dialog |
| 12 | `packages/opencode/src/installation/index.ts` | edit | `? "opencode" : "opencode-ai"` → `? "opencode" : "{{npmPackage}}"` | 1 | Install-method detection looks for our package |
| 13 | `packages/opencode/src/installation/index.ts` | edit | `/opencode-ai/${InstallationChannel}` → `/{{npmPackageEncoded}}/${InstallationChannel}` | 1 | Latest-version lookup on the internal registry (`%2F`-encoded scope, which npm registries require for scoped packages) |
| 14 | `packages/opencode/src/installation/index.ts` | edit | `opencode-ai@${target}` → `{{npmPackage}}@${target}` | 3 | `opencode upgrade` installs our package via npm, pnpm, or bun |
| 15 | `packages/opencode/src/installation/index.ts` | edit | `https://api.github.com/repos/anomalyco/opencode/releases/latest` → `https://api.github.com/repos/{{releaseRepo}}/releases/latest` | 1 | Curl-install fallback checks our releases |
| 16 | `packages/opencode/src/cli/cmd/uninstall.ts` | edit | `Uninstall OpenCode` → `Uninstall {{productName}}` | 1 | `opencode uninstall` intro |
| 17 | `packages/opencode/src/cli/cmd/uninstall.ts` | edit | `Thank you for using OpenCode!` → `Thank you for using {{productName}}!` | 1 | `opencode uninstall` farewell |
| 18 | `packages/opencode/src/cli/cmd/run/splash.ts` | edit | `top, "OpenCode", right` → `top, "{{productName}}", right` | 1 | Scrollback splash title next to the mark |
| 19 | `packages/opencode/src/cli/cmd/run/footer.permission.tsx` | edit | `Tell OpenCode what to do differently` → `Tell {{productName}} what to do differently` | 2 | Permission footer (placeholder and hint) |
| 20 | `packages/opencode/src/cli/cmd/run/permission.shared.ts` | edit | `until OpenCode is restarted` → `until {{productName}} is restarted` | 2 | Permission scope description |
| 21 | `packages/opencode/src/cli/cmd/run/footer.prompt.tsx` | edit | `close OpenCode` → `close {{productName}}` | 1 | `/exit` slash-command description |
| 22 | `packages/tui/src/feature-plugins/sidebar/footer.tsx` | edit | `OpenCode includes free models` → `{{productName}} includes free models` | 1 | Sidebar getting-started hint |

Transforms 16 to 21 cover the second copy of these strings: upstream keeps a `packages/opencode/src/cli/cmd/run/` implementation of the prompt, splash, and permission UI alongside `packages/tui`, and both are compiled into the binary. Whenever a string is rebranded in one, the other has to be checked for a twin.

Deliberately **not** changed, because they name the third-party services OpenCode Zen and OpenCode Go rather than the application: `feature-plugins/home/tips-view.tsx` line 278 and `component/dialog-provider.tsx` lines 374 to 389. Also unchanged: `.scriptName("opencode")` in `packages/opencode/src/index.ts`, because the command keeps its name.

### 4.2 Graphical UI transforms (added 2026-09-18)

`packages/app` and `packages/ui` are the graphical UI that `opencode web` serves from the binary and that the desktop app wraps. `packages/app/public/*` are symlinks into `packages/ui/src/assets/favicon/`, so each asset is replaced once.

| # | File | Kind | What | Assertion |
|---|---|---|---|---|
| 23 | `packages/ui/src/theme/themes/oc-2.json` | json | Theme display name; the accent tokens in both modes (`palette.primary`, `palette.interactive`, `overrides.surface-interactive-weak`, the seven `v2Overrides` accent/focus tokens); and the **light skin** from simplifyx.com: the 13-step light grey ramp re-tinted to the site's neutrals (white cards `#ffffff`, lavender canvas `#f3eaf6` (deliberately stronger than the site's `#f9f4fa`, which read as plain white in an app), cool grey `#4f5766`, navy `#1f242d`), the light purple ramp replaced by the brand purples (`#7d2b8c` at 600, `#51115c` at 800), the literal v1 text, border, icon and surface overrides, and `palette.neutral`/`ink`/`info`. Every light surface, text, icon and border token resolves through the grey ramp, so the tokens themselves are left pointing at it. The id stays `oc-2` so saved theme preferences keep resolving. **Dark skin:** the same ramp read from its dark end, re-tinted to deep plum (canvas `#170a1d`, cards `#22122a`, raised layers up to `#60456d`, body text `#f7f2f9`, faintest text `#9486a0` so it holds 4.5:1 on the cards), the same brand purple ramp as light, and the literal v1 overrides. Semantic (red, green, ...) and syntax colours stay upstream's in both modes. | every path exists |
| 24 | `packages/ui/src/components/logo.tsx` | drop-in | `Mark`, `Splash`, `Logo`: an "X" on upstream's own 4 x 5 pixel grid with a brand-purple centre block, then upstream's unchanged "code" glyphs, centred in the original view box | target exists |
| 25 | `packages/ui/src/v2/components/wordmark-v2.tsx` | drop-in | The new-session wordmark, same construction | target exists |
| 26 | `packages/app/index.html` | edit | `<title>` | 1 |
| 27-28 | `packages/ui/src/assets/favicon/site.webmanifest` | edit | `name`, `short_name` | 1 each |
| 29 | `packages/ui/src/components/favicon.tsx` | edit | `apple-mobile-web-app-title` | 1 |
| 30 | `packages/app/src/components/windows-app-menu.tsx` | edit | Windows app-menu heading | 1 |
| 31 | `packages/ui/src/theme/context.tsx` | edit | Theme-picker label `"oc-2": "OC-2"` | 1 |
| 57-59 | `packages/app/src/components/titlebar.tsx` | edit | Import and place `BrandLockup` (X mark, product name, tagline; defined in our `logo.tsx` drop-in) at the right end of both titlebar layouts, the only chrome present on every page. Beside it goes `BrandThemeToggle`, a one-click light/dark switch: it shows the mode you would switch to (moon in light, sun in dark), flips the effective mode through the theme context's own `setColorScheme` (which persists the choice, so Settings stays in sync), and is a real `<button>` because upstream's `base.css` exempts buttons from the titlebar's window-drag region. Its labels are English only. Hover, pressed and focus styles are part of the titlebar strip CSS. The wordmark drop-in also carries the tagline, outside its fade mask. | 1 each |
| 60-64 | `packages/ui/src/theme/context.tsx`, `packages/app/public/oc-theme-preload.js`, `packages/app/index.html` | edit | The light canvas colour `#fafafa` is hard-coded where it paints before the theme loads; changed to `#f3eaf6` so there is no grey flash. Default colour scheme `"system"` becomes `"light"`, like the site; a stored user preference still wins and dark stays available in Settings. | 2, 2, 2, 1, 1 |
| 69-70 | `packages/ui/src/theme/context.tsx`, `packages/app/public/oc-theme-preload.js` | edit | The dark canvas `#080808` is hard-coded for first paint in the same two files as the light one; changed to `#170a1d`. | 2 each |
| 65-66 | `packages/app/src/components/titlebar.tsx`, `titlebar.css` | edit | **Brand-purple titlebar strip**, in both colour schemes. The `<header>` gets a `data-brand-titlebar` marker, and a block appended after the first rule of upstream's stylesheet re-points, for that subtree only, the theme tokens its children read: `--v2-background-bg-deep` (the strip, the inactive tab base and the tab-scroll fades all read it), the active-tab and separator layers, text, icon, border and overlay tokens, and the legacy v1 equivalents. Tailwind's `--color-*` aliases resolve once at `:root`, so every overridden token is re-aliased inside the block; a test enforces that pairing. The lockup's purple centre block switches to the site's teal via `--brand-lockup-accent`. Menus and tooltips are portalled to `<body>` and keep the normal theme. | 1 each |
| 67-68 | `packages/app/src/pages/home/home-projects-view.tsx`, `packages/app/src/index.css` | edit | **Deeper-tinted project panel** on the home page. The column's `<aside>` gets a `data-brand-sidebar` marker, and a block appended after the last `@import` of the app's global stylesheet paints it in the site's card tint `#eadced` (dark mode: `#341d40`, a step lighter than the plum card it sits on) with 12px corners, shows the selected project as a white pill, and sets the heading in deep brand purple. Same scoped-token technique as the titlebar, with the same enforced `--color-*` re-aliasing. On wide screens upstream's 52px top padding would show as an empty band inside a painted panel, so 40px of it moves into the margin, the sticky offset and the height. | 1 each |
| 32-37 | six files in `packages/ui/src/assets/favicon/` | drop-in (binary) | Favicons and install icons, generated from `brand/icon.png` by `script/make-favicons.ts` | target exists |
| 38 | `packages/app/src/i18n/*.ts`, skipping `.test.ts` | rule | Every `OpenCode` except `OpenCode Zen` and `OpenCode Go`, in all 63 locale files (about 2,600 occurrences) | at least 3 files change |

Deliberately unchanged in the GUI: the theme-picker label for upstream's own classic theme, which is still called OpenCode; the internal Shiki/marked theme identifier `"OpenCode"`; and type names such as `OpenCodeEvent`. `minFiles` is 3 because that is how many locale files the test fixtures carry; zero changed files is the failure it exists to catch (the directory moved).

### 4.3 Desktop shell transforms and the `--desktop` mode (added 2026-09-18)

`packages/desktop` is the Electron shell around the graphical UI. Only upstream's `prod` channel is ever built, so only its names change; the `dev` and `beta` names stay upstream's and are allowlisted in the leftover-string guard.

| # | File | Kind | What |
|---|---|---|---|
| 39-42 | `packages/desktop/electron-builder.config.ts` | edit | `productName`, protocol display name, prod app id `{{desktopAppId}}` (`com.simplifyx.xcode.desktop`), artifact name `{{productSlug}}-desktop-...`. The `opencode://` scheme is kept so deep links keep working. |
| 43-44 | `packages/desktop/src/main/index.ts` | edit | Prod app name (menus, Dock, data folder) and app id (settings folder). Distinct from stock, so both install side by side. |
| 45 | `packages/desktop/src/main/constants.ts` | edit | `UPDATER_ENABLED = false`. Upstream's feed is anomalyco's GitHub releases; leaving it on would let the app replace itself with stock OpenCode. |
| 46-47 | `src/main/windows.ts`, `src/renderer/index.html` | edit | Window and page titles |
| 48 | `packages/desktop/src/renderer/i18n/*.ts` | rule | Same rule as the GUI locales; at least 2 files change (62 upstream) |
| 49-56 | eight files in `packages/desktop/icons/prod/` | drop-in (binary) | Generated from `brand/icon.png` by `script/make-desktop-icons.ts`, same names and pixel sizes as upstream's. Their test fixtures are 1-byte stand-ins, because upstream's originals total 1.5 MB and the engine only checks that a target exists. |

`pipeline.ts --desktop` (macOS only in this stage) reuses the shared checkout (clone, Bun check, install, transforms), then in `packages/desktop` runs upstream's own steps with `OPENCODE_CHANNEL=prod`: `scripts/prepare.ts` (icons, version, the Node server bundle the app embeds), `electron-vite build`, and `electron-builder --mac --<arch> --dir --publish never -c.mac.notarize=false` with certificate discovery disabled. It then signs the app ad hoc (Apple Silicon will not run unsigned code), verifies the signature, checks `CFBundleName`, `CFBundleIdentifier` and that `app.asar` carries the rebranded UI strings, and installs to `~/Applications`. Build failures exit 4, verification failures exit 5.

Out of scope for this stage and owned by CI later: Developer ID signing and notarization, Windows and Linux packaging (each needs its own runner), installers (`dmg`, `nsis`, `deb`), and a private update feed. The Terminal launcher from earlier is renamed "XCode Terminal" and is opt-in via `--launcher`, so the plain product name belongs to the desktop app.

The registry base URL comes from the developer's `.npmrc` through upstream's existing `NpmConfig.registry()` call, so the upgrader works against Artifactory or Nexus without further edits.

### 4.4 Brand config names (added 2026-09-21)

Transforms 71-106 are the only **behavioural** ones; everything else is text, colour or artwork. They are strictly **additive**: every name and folder upstream reads still works, the brand ones are read as well, and they are merged later so they win.

| Brand name | Beside upstream's | Notes |
|---|---|---|
| `xcode.json`, `xcode.jsonc` | `opencode.json`, `opencode.jsonc` | In the global folders, project folders, `.opencode/` / `.xcode/` folders and both managed folders |
| `~/.config/xcode/` | `~/.config/opencode/` | Listed only when it exists, because upstream writes a `.gitignore` into every listed folder and dies if it cannot. Also holds `tui.json`. |
| `.xcode/` in a project or the home folder | `.opencode/` | Config, agents, commands, skills, plugins, `tui.json` |
| `/Library/Application Support/xcode/`, `%ProgramData%\xcode`, `/etc/xcode/` | the `opencode` equivalents | Company-managed; read after upstream's |
| MDM domain `com.simplifyx.xcode.managed` | `ai.opencode.managed` | Checked first; the first profile found is used |

Rules that the end-to-end script pins down:

- Within one folder the brand file beats upstream's, and the two are **merged**, not swapped: a key only in `opencode.json` survives.
- A closer folder still beats an outer one whatever the files are called. Upstream got outer-first order by reversing its directory walk; with two name families that is replaced by an explicit sort (folder depth, then upstream-before-brand, then `.json` before `.jsonc`).
- The app writes global settings to the first config file that exists, so **an existing `opencode.json` keeps being used and nothing is created beside it**. Only a machine with no config at all is seeded with `~/.config/xcode/xcode.jsonc`.
- `opencode mcp add` edits whichever config exists, brand names first, and creates `xcode.json` when none does. Upstream's new core (`packages/core`) reads the same file names.

- **A whole-folder move must keep working.** `mv ~/.config/opencode ~/.config/xcode` leaves a file still named `opencode.json` inside the brand folder, so the brand folder reads **both** name families, upstream's first, and that moved file stays the one the app writes to. The first version read only brand names there and silently ignored the moved config (no provider, no models); it was found on the requester's machine minutes after the command was published, and is now an end-to-end scenario. Once the brand folder exists, upstream's global folder is listed only while it still holds something of the user's; otherwise upstream would refill the emptied folder with a `.gitignore` and `node_modules`. Upstream still recreates the empty folder itself at startup.

Deliberately unchanged: the `$schema` URL (a real hosted schema that gives editors completion), the data, cache and state folders (moving them would orphan session history), the `OPENCODE_*` variables. The curl-installer paths (`~/.opencode/bin`) are also untouched; this build is not distributed that way.

**Where new files are created (transforms 88-106, added 2026-09-21).** Reading is additive; writing follows one rule, `ConfigPaths.writeDirIn(root)` and `writeGlobalDir()`, part of the helper block spliced into upstream's `config/paths.ts`:

- In a project: `.xcode/`, **unless the project already has `.opencode/` and no `.xcode/`**, in which case `.opencode/` keeps being used. One project's agents, plans and themes are never split across two folders.
- Globally: `~/.config/xcode/` once it exists (a fresh install is seeded with it), else upstream's folder.

Every write site goes through it: `opencode agent create`, plan files (`<folder>/plans/`), plugin install (folder, and the file inside it: an existing file of either name, else `xcode.json`), themes installed by TUI plugins, and the `tui.json` a plugin falls back to. Plan mode denies every edit except the plans folder, so the brand folder gets its own allow rule in both permission engines, beside upstream's. Custom-theme discovery in the TUI package reads the brand folders too. The home-screen tips name `.xcode/`, and the built-in "customize" skill, which the model follows when asked to create agents, commands or skills, gains a preface (prefer the brand names, add to an existing `.opencode/` rather than creating a second folder) and descriptions that also trigger on the brand names; its body is kept, not rewritten.

The helper block is exported as `CONFIG_PATH_HELPERS` so the unit tests can **execute** it (transpiled, against a fake filesystem) rather than only read it. `opencode agent create` always calls a model, so that one write site is not exercised end to end; it is covered by the executed helper, the call-site assertions and the real build.

**Verification.** String assertions on the patched source cannot prove a config loader works, so `script/e2e-config.ts` runs ten scenarios against a real built binary in a sandboxed home (`XDG_*` and upstream's own `OPENCODE_TEST_*` hooks point into a temp folder, so the real `~/.config/opencode` is never touched). Against a binary without these transforms it fails the six brand cases and passes the two existing-behaviour cases; against one with them, all ten pass. Run it after every upstream bump: these anchors sit in functional code and will drift more often than the cosmetic ones.

## 5. Logo and theme

### 5.1 Logo

`brand/logo.ts` exports the same shape upstream does (`logo.left`, `logo.right`, `go`, `marks`) so `logo.tsx` keeps compiling. `right` is upstream's own "code" glyphs, unchanged, so letterforms match the rest of the TUI. `left` is a five-column X:

```
                   ▄
▀▄ ▄▀ █▀▀▀ █▀▀█ █▀▀█ █▀▀█
 ▄█▄  █    █  █ █  █ █▀▀▀
▄▀ ▀▄ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀
      by SimplifyX
```

Transform 3 renders the X in `theme.primary` (brand purple) and "Code" in `theme.text`. Transform 4 adds the tagline in `theme.textMuted`, indented to align under "Code". The exact X glyph is tuned in a real terminal during the first local build; the shape above is the starting point. Upstream's shadow marks (`_ ^ ~ ,`) remain available for the tuned version.

### 5.2 Theme

`brand/theme.json` starts as a copy of upstream's `packages/tui/src/theme/assets/opencode.json` (schema `https://opencode.ai/theme.json`, `defs` + `theme` sections). Only `defs` values change; the `theme` mapping is untouched so every UI role still resolves. Target values:

| `defs` role | Dark | Light |
|---|---|---|
| Step1 (background) | `#14171d` | `#ffffff` |
| Step2–8 (surfaces, borders) | grays interpolated from `#1f242d` to `#5c6373` | grays interpolated from `#f9f4fa` to `#b8bcc4` |
| Step9 (primary) | `#b56fc7` | `#7d2b8c` |
| Step10 (primary hover) | `#c98fd9` | `#51115c` |
| Step11 (muted text) | `#8b93a3` | `#4f5766` |
| Step12 (text) | `#eeeeee` | `#1f242d` |
| Secondary | `#4de8f9` | `#1863dc` |
| Accent | `#c98fd9` | `#51115c` |
| Red / Orange / Green / Cyan / Yellow | upstream dark values | upstream light values |

Dark-mode purples are lightened from the site's `#7d2b8c` so text passes a 4.5:1 contrast ratio on `#14171d`; the site's purple is too dark for that on its own. The semantic colors (error, warning, success, info, syntax) stay on upstream's values because the brand defines none.

## 6. Packaging

Upstream's `packages/opencode/script/build.ts` runs **unmodified** and emits `dist/opencode-<os>-<arch>[-baseline][-musl]/` folders, each with a `package.json` (name like `opencode-darwin-arm64`) and `bin/opencode`. `src/package.ts` then:

1. Rewrites each platform folder's `package.json` name to `@simplifyx/xcode-<suffix>` (suffix is the upstream name with the `opencode-` prefix removed). Version is left as is.
2. Generates a meta package `@simplifyx/xcode` mirroring upstream's `packages/opencode/script/publish.ts` output: `package.json` with `bin: { opencode: "./bin/opencode.exe" }`, `postinstall`, `os`, `cpu`, `license`, and `optionalDependencies` mapping every scoped platform package to the version. It copies upstream's `postinstall.mjs` with one asserted edit, ``const base = `opencode-${platform}-${arch}` `` → ``const base = `@simplifyx/xcode-${platform}-${arch}` ``, and copies the upstream placeholder `bin/opencode.exe` script and the `LICENSE` file.
3. Runs `npm pack` on every package into `dist/npm/`.

Scoped names avoid any collision with the public `opencode-ai` when the internal registry also proxies npmjs.org. Version numbers mirror upstream exactly, so `1.18.31` means the same build in both worlds. Republishing the same version for a brand-only fix is not supported by npm semantics; the maintainer either unpublishes on the internal registry (Artifactory and Nexus allow this) or waits for the next upstream tag, which arrives within days.

Every published package carries upstream's MIT `LICENSE`, satisfying the attribution requirement.

## 7. Pipeline

### Prerequisites on the machine running the pipeline

| Tool | Requirement | Status on the requester's Mac (2026-09-17) |
|---|---|---|
| Bun | Satisfying `^<upstream packageManager>` (`^1.3.14` for v1.18.31); newer is fine, older is not | **Not installed.** Needed before the first local build. |
| Node.js + npm | Any current LTS; used for `npm pack`, `npm install -g`, `npm publish` | Node 20.20.2, npm 10.8.2 present |
| git | Any recent version | 2.50.1 present |
| Network | Access to github.com for the clone and to the npm registry (public for upstream's dependencies during `bun install`, internal for publishing) | – |

The overlay's own `package.json` pins the Bun version it was last verified with, and `pipeline.ts` prints the exact install hint when the version does not match.

`src/pipeline.ts` is the single entry point, runner-agnostic, invoked as `bun run src/pipeline.ts <mode> [--version X.Y.Z]`.

| Mode | What it does |
|---|---|
| `--check` | Lists upstream tags newer than the latest version in the internal registry, capped to the newest three so a backlog cannot fan out into a huge release matrix. Exit 0 with the list, or "up to date". A registry error other than a 404 for our own package is an exit 1, not "nothing published yet". No side effects. |
| `--local` | For one version: clone, rebrand, build only the current platform (`build.ts --single`), package, then generate a `dist/local/` variant of the meta package whose `optionalDependencies` entry for this platform is a `file:` reference to the local platform tarball, and run `npm install -g dist/local/<meta>`. Prints the installed path and `opencode --version`. Accepts `--skip-web-ui` to pass `--skip-embed-web-ui` to the build for faster iteration. |
| `--release` | For one version: check that `gh` can see `releaseRepo` before anything is published, then clone, rebrand, build all twelve targets, package, run the smoke test, `npm publish` every tarball to the registry from `.npmrc`, and create a GitHub release on `releaseRepo` with the raw binaries attached (fallback for machines without npm). Publishing is the last step and skips packages already present at that version, so a rerun is idempotent. |

Common steps:

1. `git clone --depth 1 --branch v<version>` of upstream into `work/<version>/`.
2. Read `packageManager` from upstream `package.json` and fail unless the local Bun satisfies `^<pin>` (the same range upstream's own scripts accept).
3. `bun install` inside the clone (applies upstream's dependency patches).
4. Apply transforms (Section 4); stop on the first failed assertion.
5. Run upstream `packages/opencode/script/build.ts` with `OPENCODE_VERSION=<version>` and `OPENCODE_CHANNEL=latest`, so the build does not call npmjs.org to discover a version.
6. Package (Section 6).

`.github/workflows/rebrand.yml` runs `--check` daily and, for each new version, `--release` on a Linux runner. `workflow_dispatch` accepts a `version` input for manual runs, validated against `X.Y.Z` before it reaches a shell. Secrets, each scoped to the steps that need it: `NPM_REGISTRY_URL` and `NPM_TOKEN` for the internal registry (written as a scoped `@simplifyx:registry=` line, so upstream's public dependencies still resolve from npmjs), and `RELEASE_REPO_TOKEN` with `contents:write` on `releaseRepo` for the GitHub release. The workflow is about twenty lines; moving to GitLab CI or Azure DevOps means rewriting those twenty lines, not the pipeline.

**Signing hook.** `--release` calls an optional `sign` step between build and package that is a no-op until a script is provided; IT can plug in Windows Authenticode or macOS codesign later without touching the rest.

### Error handling

- Failed anchor assertion: exit 2, message names file, anchor, expected and actual counts. Nothing built.
- Bun version mismatch or missing tool: exit 3 with the required version.
- Upstream build failure: exit 4, upstream's stdout and stderr streamed through unchanged.
- Smoke-test failure: exit 5, nothing published.
- Publish, archive, or GitHub-release failure: continue with the others, then exit 6 listing what published and what failed, so a rerun completes the set.

## 8. Testing

**Unit tests** (`bun test`, no network):

- `transforms.test.ts` applies the full transform list to `test/fixtures/upstream/` (the touched files copied from v1.18.31, including three of the 63 locale files) in a temp directory and asserts: every anchor is found the expected number of times, placeholders are all filled, and `logo.ts` still exports `logo`, `go`, and `marks`. A regression guard then walks the whole fixture tree and fails on any surviving `OpenCode` occurrence that is not on an explicit allowlist (today: the "OpenCode Zen" tip, and the comment in our own `brand/logo.ts` drop-in naming the OpenCode Go dialog).
- A drift test mutates one fixture so an anchor disappears and asserts the engine exits with the file and anchor in the message and writes nothing.
- `package.test.ts` runs `package.ts` against a fake `dist/` with two platform folders and asserts the scoped names, the `optionalDependencies` map, the postinstall edit, and the presence of `LICENSE`.

**Smoke test** (part of `--local` and `--release`, needs a built binary): run `bin/opencode --version` and confirm it prints the expected version; run `strings` (or a byte scan on Windows) over the binary and confirm `XCode` and `by SimplifyX` are present.

**Acceptance for this phase:** `--local --version 1.18.31` on the requester's Mac replaces the stock install, `opencode` starts, the home screen shows the XCode logo, tagline, and purple palette, the terminal title reads XCode, and `opencode upgrade` reports that it is checking `@simplifyx/xcode` (it will fail to find the package until the registry exists, and that failure is expected).

## 9. Maintenance model

- A new upstream tag with no anchor drift: zero human work. The daily run publishes it.
- A new upstream tag with anchor drift: the run fails at step 4 naming the anchor. The maintainer opens the upstream diff for that file, updates one line in `src/transforms.ts` (and the fixture), and reruns. Expected effort is minutes, expected frequency is low because the twenty-two anchors sit in stable, cosmetic code.
- Upstream changes the theme JSON schema: `--local` shows a broken palette before anything ships; the fix is regenerating `brand/theme.json` from the new upstream default.
- Brand change (new colors, new tagline): edit `brand/`, rerun. No transform changes.

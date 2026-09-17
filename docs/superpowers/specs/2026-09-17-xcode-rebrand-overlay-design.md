# XCode Rebrand Overlay — Design

**Date:** 2026-09-17
**Status:** Approved in discussion, pending written review
**Upstream:** [anomalyco/opencode](https://github.com/anomalyco/opencode), baseline tag `v1.18.31`

## 1. Goal

Ship OpenCode to SimplifyX developers as **XCode by SimplifyX**: the same tool, with the SimplifyX color palette, an XCode logo, XCode wording on screen, and an upgrader that pulls from the internal registry. Keep the rebrand small enough that every upstream release (currently two or three a week) can be rebranded, built, and published automatically within an hour, with no manual merging.

The first deliverable is a **local build installed on one developer's Mac** (the requester's), replacing the stock `opencode-ai@1.18.29` install. Mass rollout through the internal npm registry follows once that looks right.

### Non-goals

- Renaming the `opencode` command, the `.opencode` config directory, `OPENCODE_*` environment variables, provider ids, plugin APIs, or the HTTP server. Upstream documentation must keep applying verbatim.
- Rebranding the Electron desktop app, the web UI, the VS Code extension, or the share pages.
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
    fixtures/upstream/  copies, at v1.18.31, of the six upstream files that asserted
                        edits touch, plus upstream's postinstall.mjs for package tests
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

Two transform kinds, and only two:

- **Drop-in.** Overwrite a whole upstream file with a file from `brand/`. Used where we own the entire content.
- **Asserted edit.** Replace an exact string in an upstream file. The engine reads the file, checks that the anchor string occurs exactly the expected number of times, replaces it, and writes. **If the count differs, the run stops** with the file path, the anchor, the expected count, and the actual count. Nothing is built or published.

There are no `.patch` files and no fuzzy matching. A missing anchor is the drift signal: it tells the maintainer exactly which upstream change to look at, and the fix is a one-line edit to `src/transforms.ts`.

`transforms.ts` is a plain array so the test suite and the pipeline share one definition:

```ts
type Transform =
  | { kind: "dropin"; file: string; source: string }
  | { kind: "edit"; file: string; find: string; replace: string; count: number }
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

Deliberately **not** changed, because they name the third-party services OpenCode Zen and OpenCode Go rather than the application: `feature-plugins/sidebar/footer.tsx` line 56, `feature-plugins/home/tips-view.tsx` line 278, and `component/dialog-provider.tsx` lines 374 to 389. Also unchanged: `.scriptName("opencode")` in `packages/opencode/src/index.ts`, because the command keeps its name.

The registry base URL comes from the developer's `.npmrc` through upstream's existing `NpmConfig.registry()` call, so the upgrader works against Artifactory or Nexus without further edits.

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
| Bun | Same major.minor as upstream's `packageManager` field (`1.3.14` for v1.18.31) | **Not installed.** Needed before the first local build. |
| Node.js + npm | Any current LTS; used for `npm pack`, `npm install -g`, `npm publish` | Node 20.20.2, npm 10.8.2 present |
| git | Any recent version | 2.50.1 present |
| Network | Access to github.com for the clone and to the npm registry (public for upstream's dependencies during `bun install`, internal for publishing) | – |

The overlay's own `package.json` pins the Bun version it was last verified with, and `pipeline.ts` prints the exact install hint when the version does not match.

`src/pipeline.ts` is the single entry point, runner-agnostic, invoked as `bun run src/pipeline.ts <mode> [--version X.Y.Z]`.

| Mode | What it does |
|---|---|
| `--check` | Lists upstream tags newer than the latest version in the internal registry. Exit 0 with the list, or "up to date". No side effects. |
| `--local` | For one version: clone, rebrand, build only the current platform (`build.ts --single`), package, then generate a `dist/local/` variant of the meta package whose `optionalDependencies` entry for this platform is a `file:` reference to the local platform tarball, and run `npm install -g dist/local/<meta>`. Prints the installed path and `opencode --version`. Accepts `--skip-web-ui` to pass `--skip-embed-web-ui` to the build for faster iteration. |
| `--release` | For one version: clone, rebrand, build all twelve targets, package, run the smoke test, `npm publish` every tarball to the registry from `.npmrc`, and create a GitHub release on `releaseRepo` with the raw binaries attached (fallback for machines without npm). Publishing is the last step and skips packages already present at that version, so a rerun is idempotent. |

Common steps:

1. `git clone --depth 1 --branch v<version>` of upstream into `work/<version>/`.
2. Read `packageManager` from upstream `package.json` and fail if the local Bun differs in major or minor version (upstream's own scripts enforce this).
3. `bun install` inside the clone (applies upstream's dependency patches).
4. Apply transforms (Section 4); stop on the first failed assertion.
5. Run upstream `packages/opencode/script/build.ts` with `OPENCODE_VERSION=<version>` and `OPENCODE_CHANNEL=latest`, so the build does not call npmjs.org to discover a version.
6. Package (Section 6).

`.github/workflows/rebrand.yml` runs `--check` daily and, for each new version, `--release` on a Linux runner. `workflow_dispatch` accepts a `version` input for manual runs. Secrets: `NPM_TOKEN` for the registry, `GITHUB_TOKEN` for releases. The workflow is about twenty lines; moving to GitLab CI or Azure DevOps means rewriting those twenty lines, not the pipeline.

**Signing hook.** `--release` calls an optional `sign` step between build and package that is a no-op until a script is provided; IT can plug in Windows Authenticode or macOS codesign later without touching the rest.

### Error handling

- Failed anchor assertion: exit 2, message names file, anchor, expected and actual counts. Nothing built.
- Bun version mismatch or missing tool: exit 3 with the required version.
- Upstream build failure: exit 4, upstream's stdout and stderr streamed through unchanged.
- Smoke-test failure: exit 5, nothing published.
- Publish failure for one package: continue with the others, then exit 6 listing what failed, so a rerun completes the set.

## 8. Testing

**Unit tests** (`bun test`, no network):

- `transforms.test.ts` applies the full transform list to `test/fixtures/upstream/` (the six touched files copied from v1.18.31) in a temp directory and asserts: every anchor is found the expected number of times, no user-facing `OpenCode` string remains in the six files except the four deliberately kept Zen/Go lines, placeholders are all filled, and `logo.ts` still exports `logo`, `go`, and `marks`.
- A drift test mutates one fixture so an anchor disappears and asserts the engine exits with the file and anchor in the message and writes nothing.
- `package.test.ts` runs `package.ts` against a fake `dist/` with two platform folders and asserts the scoped names, the `optionalDependencies` map, the postinstall edit, and the presence of `LICENSE`.

**Smoke test** (part of `--local` and `--release`, needs a built binary): run `bin/opencode --version` and confirm it prints the expected version; run `strings` (or a byte scan on Windows) over the binary and confirm `XCode` and `by SimplifyX` are present.

**Acceptance for this phase:** `--local --version 1.18.31` on the requester's Mac replaces the stock install, `opencode` starts, the home screen shows the XCode logo, tagline, and purple palette, the terminal title reads XCode, and `opencode upgrade` reports that it is checking `@simplifyx/xcode` (it will fail to find the package until the registry exists, and that failure is expected).

## 9. Maintenance model

- A new upstream tag with no anchor drift: zero human work. The daily run publishes it.
- A new upstream tag with anchor drift: the run fails at step 4 naming the anchor. The maintainer opens the upstream diff for that file, updates one line in `src/transforms.ts` (and the fixture), and reruns. Expected effort is minutes, expected frequency is low because the fifteen anchors sit in stable, cosmetic code.
- Upstream changes the theme JSON schema: `--local` shows a broken palette before anything ships; the fix is regenerating `brand/theme.json` from the new upstream default.
- Brand change (new colors, new tagline): edit `brand/`, rerun. No transform changes.

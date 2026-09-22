# simplify-code-overlay

Builds **Simplify Code by SimplifyX**: [OpenCode](https://github.com/anomalyco/opencode) with SimplifyX colors, logo, and name. No fork. This repo holds only brand assets and a pipeline that clones an upstream tag, applies twenty-two small, asserted edits, builds it with upstream's own build script, and packages it as `@simplifyx/simplify-code`.

Design: `docs/superpowers/specs/2026-09-17-xcode-rebrand-overlay-design.md`

## For developers

```bash
npm install -g @simplifyx/simplify-code --registry <internal registry URL>
opencode
```

The command is `opencode` and all upstream docs apply. `opencode upgrade` pulls from the internal registry.

**Configuration.** Use Simplify Code names: `~/.config/simplify-code/simplify-code.json` for yourself, `simplify-code.json` or a `.simplify-code/` folder in a project. OpenCode's names (`~/.config/opencode/opencode.json`, `opencode.json`, `.opencode/`) keep working, so existing setups and upstream's docs still apply; where both exist the Simplify Code one wins and the two are merged. If you already have an `opencode.json`, nothing changes until you choose to rename it. New files (agents, plans, themes, plugin config) are created under `.simplify-code/`, except in a project that already has a `.opencode/` folder, which keeps being used so nothing is split across two folders. To move your personal setup over completely: `mv ~/.config/opencode ~/.config/simplify-code`. The `opencode.json` that comes along keeps working under its old name inside the new folder; rename it to `simplify-code.json` whenever you like. Upstream recreates an empty `~/.config/opencode` at startup; it is harmless and is no longer filled with anything.

### Desktop app (macOS)

**Simplify Code.app** is the graphical way in: OpenCode's desktop app, rebranded. Projects, sessions, model and mode pickers, providers, skills, plugins and settings are all point-and-click. Build and install it on a Mac with:

```bash
bun run src/pipeline.ts --desktop --version 1.18.31
```

It lands in `~/Applications/Simplify Code.app`, so it shows up in Launchpad and Spotlight. It has its own bundle id (`com.simplifyx.simplify-code.desktop`) and its own data folder, so it installs beside stock OpenCode Desktop without sharing state. It brings its own copy of the server, built from the same rebranded source, and does not need the `opencode` command installed.

Two deliberate limits of this local build:

- **It never updates itself.** Upstream's updater follows anomalyco's GitHub releases and would replace Simplify Code with stock OpenCode, so it is switched off. New versions are delivered by rebuilding (or, later, by IT) until we publish our own update feed.
- **It is ad-hoc signed, not notarized.** That is fine for an app built on the Mac that runs it. An app that is downloaded or copied between Macs needs a Developer ID signature and notarization, or an MDM that installs it without the quarantine flag. That, plus Windows and Linux builds, is CI work that needs the company's signing certificates.

### Terminal launcher (macOS, optional)

For people who prefer the terminal UI but want an icon: `bun run src/pipeline.ts --launcher` installs **Simplify Code Terminal.app**. Clicking it asks which project folder to open (it remembers the last one), then opens a Terminal window running `opencode` there. Set `SIMPLIFY_CODE_PROJECT_DIR` to skip the chooser. It is a thin wrapper around the `opencode` command, needs `@simplifyx/simplify-code` installed, and says so if it is missing.

The app icon, the favicons and the desktop icon set all derive from `brand/icon.png`: regenerate with `bun run script/make-icon.ts`, then `script/make-favicons.ts` and `script/make-desktop-icons.ts` (macOS), or replace the PNG with a designer's artwork and run the last two.

## Company-managed configuration

`managed/opencode.jsonc` is the configuration IT installs on every machine: it pins the company AI gateway and its models, disables sharing and self-update, and locks out every other provider, and developers cannot override it. It is independent of the builds. See `managed/README.md`, and always run `bun run script/check-managed.ts` before deploying.

## For maintainers

Prerequisites: Bun satisfying `^<upstream packageManager>` (our own `package.json` pins the version last verified), Node 20+, git. Run `bun install` in the overlay first; it provides the pinned `node-gyp` that upstream's native build needs (without it, `bun install` inside the upstream checkout auto-fetches a `node-gyp@latest` that is broken on Node 20). `--check` and `--release` both need an `~/.npmrc` pointing at the internal registry (`--check` asks it for the latest published version); `--release` also needs `gh` authenticated against `releaseRepo`.

```bash
bun install
bun test                                            # offline unit tests
bun run src/pipeline.ts --check                     # upstream versions not yet published
bun run script/e2e-config.ts                        # after --local: 8 config scenarios against the real binary
bun run src/pipeline.ts --local --version 1.18.31   # build + install on this machine
bun run src/pipeline.ts --desktop --version 1.18.31 # macOS: build + install the desktop app
bun run src/pipeline.ts --package --version 1.18.31 # terminal version, all 12 targets -> dist/<v>/package
bun run src/pipeline.ts --desktop-package --version 1.18.31 # desktop app, Mac + Windows -> dist/<v>/desktop
bun run script/publish-bundle.ts --version 1.18.31 --repo owner/name [--bundle desktop] # a bundle -> GitHub Release
bun run src/pipeline.ts --release --version 1.18.31 # build all targets, publish, GitHub release
```

Add `--skip-web-ui` to `--local` for a faster build without the embedded web UI.

`--local` replaces any stock `opencode-ai` install with the build it just produced; `npm install -g opencode-ai` restores the stock package. It prints npm's own global bin path, and warns if the `opencode` that wins on your `PATH` comes from somewhere else (a brew or curl-installer copy shadowing the branded one).

`--check` lists at most the newest three unpublished upstream versions and says how many older ones it skipped, so a long backlog cannot fan out into a huge release matrix. If the registry answers anything other than "not published yet" (npm `E404`), it exits 1 rather than pretending nothing is published.

### Packaging the desktop app (`--desktop-package`)

Runs on a Mac and cross-builds four installers: Apple Silicon and Intel zips, and Windows x64 and ARM64 setup programs, plus `install-mac.sh`, `install-windows.ps1`, `INSTALL.md` and `SHA256SUMS`. Allow about half an hour.

Upstream builds each OS on its own CI runner and bakes the host's terminal module (`@lydell/node-pty-<platform>-<arch>`) into the app. One transform makes that follow `OVERLAY_TARGET_PLATFORM` / `OVERLAY_TARGET_ARCH`, which is all that cross-building needs: every platform's native modules are already installed, and electron-builder edits Windows executables in JavaScript, so no Wine.

**Nothing it produces is signed.** Mac apps are ad-hoc signed, which Apple Silicon requires to run code at all, but Gatekeeper still refuses a downloaded copy; `install-mac.sh` clears the quarantine mark. The Windows installer trips SmartScreen; `install-windows.ps1` unblocks it. The Windows builds are verified only as far as a Mac can (processor type, version resources, branding, the right terminal module) and cannot be run here.

### Before the first `--release`

`releaseRepo` in `brand/brand.json` is a **placeholder** (`simplifyx/simplify-code-releases`). Point it at the real internal repo first; `--release` refuses to start unless `gh repo view <releaseRepo>` succeeds, so nothing is published against a repo that does not exist. The release path itself is only proven by its first CI run — no local run exercises publishing.

### CI

`.github/workflows/rebrand.yml` runs `--check` daily and `--release` for each new version (two at a time). It needs three repository secrets:

| Secret | What it is |
|---|---|
| `NPM_REGISTRY_URL` | Internal registry base URL, **with a trailing slash**, e.g. `https://artifactory.simplifyx.com/artifactory/api/npm/npm-local/` |
| `NPM_TOKEN` | Token with publish rights on that registry for the `@simplifyx` scope |
| `RELEASE_REPO_TOKEN` | GitHub token with `contents:write` on `releaseRepo` |

The generated `~/.npmrc` sets a **scoped** registry (`@simplifyx:registry=...`) rather than a global one: only our own packages go through the internal registry, and upstream's public dependencies keep resolving from npmjs.org during `bun install`.

### Exit codes

- `1` — usage/input/network: bad arguments, GitHub API error, upstream clone failed, registry unreachable, `releaseRepo` unreachable
- `2` — anchor drift
- `3` — Bun version mismatch
- `4` — upstream install or build failed
- `5` — smoke test failed
- `6` — publish, archive, GitHub release, or global install failed (the message lists what published and what did not; rerunning completes the set)

### When a run fails with "anchor drift"

Upstream changed one of the fourteen files we edit. The message names the file and the exact string.

1. Open the upstream diff for that file between the last good tag and the failing one.
2. Update the `find` (and if needed `replace`) string in `src/transforms.ts`. Keep the `count` honest.
3. Refresh the fixture: copy the file from the failing tag into `test/fixtures/upstream/...`.
4. `bun test`, commit, rerun the pipeline.

### When upstream bumps Bun

Update `packageManager` in `package.json` to the new version, install it locally, rerun. CI reads that field through `bun-version-file: package.json`, so there is nothing else to bump.

### Changing the brand

Edit `brand/brand.json`, `brand/theme.json`, or `brand/logo.ts` for the terminal UI, and `brand/gui/` for the graphical UI. The app icon and every favicon derive from one file: regenerate with `bun run script/make-icon.ts` then `bun run script/make-favicons.ts` (macOS), or replace `brand/icon.png` with a designer's artwork and run only the second. The graphical UI's colours are the `json` transform in `src/transforms.ts`: accents for both modes, and for light mode a full skin taken from simplifyx.com (the grey ramp that every surface, text and border token resolves through, plus the brand purple ramp). Light is the default scheme; dark mode is skinned in deep plum through the same ramp. A sun/moon button in the titlebar switches between them in one click and remembers the choice. The titlebar is a brand-purple strip in both schemes; its colours are the `TITLEBAR_STRIP_CSS` block in `src/transforms.ts`. The home page's project column is a deeper-tinted panel (`SIDEBAR_PANEL_CSS`, same file). Run `bun test`.

### Files we edit upstream

- `packages/tui/src/logo.ts` (replaced)
- `packages/tui/src/theme/assets/opencode.json` (replaced)
- `packages/tui/src/component/logo.tsx`
- `packages/tui/src/app.tsx`
- `packages/tui/src/attention.ts`
- `packages/tui/src/feature-plugins/home/tips-view.tsx`
- `packages/tui/src/routes/session/permission.tsx`
- `packages/tui/src/feature-plugins/sidebar/footer.tsx`
- `packages/opencode/src/installation/index.ts`
- `packages/opencode/src/cli/cmd/uninstall.ts`
- `packages/opencode/src/cli/cmd/run/splash.ts`
- `packages/opencode/src/cli/cmd/run/footer.permission.tsx`
- `packages/opencode/src/cli/cmd/run/footer.prompt.tsx`
- `packages/opencode/src/cli/cmd/run/permission.shared.ts`

Graphical UI (served by `opencode web`, wrapped by the desktop app):

- `packages/ui/src/theme/themes/oc-2.json` (accent keys patched)
- `packages/ui/src/components/logo.tsx` and `packages/ui/src/v2/components/wordmark-v2.tsx` (replaced)
- six favicon and install-icon files in `packages/ui/src/assets/favicon/` (replaced), plus `site.webmanifest`
- `packages/app/index.html`, `packages/ui/src/components/favicon.tsx`, `packages/app/src/components/windows-app-menu.tsx`, `packages/ui/src/theme/context.tsx`
- every locale in `packages/app/src/i18n/*.ts`, by rule rather than by list

Desktop shell (`--desktop`, `--desktop-package`):

- `packages/desktop/electron.vite.config.ts` (terminal module follows the build target, for cross-building)
- `packages/desktop/electron-builder.config.ts` (product name, protocol name, app id, artifact name)
- `packages/desktop/src/main/index.ts` (app name, app id), `constants.ts` (updater off), `windows.ts` and `src/renderer/index.html` (titles)
- eight icon files in `packages/desktop/icons/prod/` (replaced)
- every locale in `packages/desktop/src/renderer/i18n/*.ts`, by rule

Upstream ships two implementations of the prompt and permission UI — `packages/tui` and `packages/opencode/src/cli/cmd/run` — and both end up in the binary, so most user-facing strings have a twin.

Strings naming the third-party services "OpenCode Zen" and "OpenCode Go" are intentionally left as they are, in both UIs. To see the graphical UI, run `opencode web`.

## License

OpenCode is MIT licensed. Every package this pipeline publishes includes upstream's `LICENSE`.

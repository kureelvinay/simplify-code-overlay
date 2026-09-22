import type { Brand } from "./brand"
import { desktopArtifactName } from "./desktop-bundle"

/**
 * Pure parts of publishing a --package bundle as a GitHub Release. The network half lives in
 * script/publish-bundle.ts; what to upload, what to replace and what the release says are decided
 * here so they can be tested without a network.
 */

export interface LocalAsset {
  name: string
  size: number
}
export interface RemoteAsset {
  id: number
  name: string
  size: number
  /** GitHub reports "uploaded" for a complete asset and "starter" for an upload that never finished. */
  state: string
}

/**
 * Compare the bundle folder with what the release already holds. Anything complete and the same size
 * is skipped, so an interrupted upload resumes where it stopped. Anything partial or a different size
 * is replaced, never trusted.
 */
export function missingAssets(local: LocalAsset[], remote: RemoteAsset[]): { upload: LocalAsset[]; replace: RemoteAsset[] } {
  const upload: LocalAsset[] = []
  const replace: RemoteAsset[] = []
  for (const asset of local) {
    const existing = remote.find((r) => r.name === asset.name)
    if (existing && existing.state === "uploaded" && existing.size === asset.size) continue
    if (existing) replace.push(existing)
    upload.push(asset)
  }
  return { upload, replace }
}

export function contentType(name: string): string {
  if (name.endsWith(".zip")) return "application/zip"
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "application/gzip"
  if (name.endsWith(".exe")) return "application/octet-stream"
  return "text/plain; charset=utf-8"
}

/** Which bundle is being published. "team" is versioned by date, not by upstream version. */
export type BundleKind = "package" | "desktop" | "team"

/** Where the pipeline wrote that bundle. */
export function bundleDir(root: string, version: string, kind: BundleKind): string {
  return kind === "team" ? `${root}/dist/team/${version}` : `${root}/dist/${version}/${kind}`
}

/** Each bundle gets its own release: they all carry an INSTALL.md and a SHA256SUMS, which would collide. */
export function releaseTag(version: string, kind: BundleKind): string {
  if (kind === "team") return `team-${version}`
  return kind === "desktop" ? `v${version}-desktop` : `v${version}`
}

export function releaseTitle(brand: Brand, version: string, kind: BundleKind = "package"): string {
  if (kind === "team") return `${brand.productName} ${brand.tagline} team configuration ${version}`
  return `${brand.productName} ${brand.tagline} ${version} (${kind === "desktop" ? "desktop app" : "terminal version"})`
}

export function releaseNotes(brand: Brand, version: string, repo: string, kind: BundleKind = "package", tag: string = releaseTag(version, kind)): string {
  if (kind === "team") return teamNotes(brand, version, repo, tag)
  if (kind === "desktop") return desktopNotes(brand, version, repo, tag)
  const pkg = brand.npmPackage.split("/")[1] // platform packages, and so archives, are named after it
  return `The terminal version of **${brand.productName} ${brand.tagline}** ${version}, as standalone programs. Target machines need no Node and no npm.

Rebranded from [OpenCode v${version}](https://github.com/${brand.upstreamRepo}/releases/tag/v${version}) (MIT licensed; \`LICENSE\` is attached).

## Install

Download **the archive for your machine plus the installer** into one folder, then:

| Machine | Download | Run |
|---|---|---|
| Mac, Apple Silicon | \`${pkg}-darwin-arm64.zip\`, \`install.sh\` | \`sh install.sh\` |
| Mac, Intel | \`${pkg}-darwin-x64.zip\`, \`${pkg}-darwin-x64-baseline.zip\`, \`install.sh\` | \`sh install.sh\` |
| Windows, Intel or AMD | \`${pkg}-windows-x64.zip\`, \`${pkg}-windows-x64-baseline.zip\`, \`install.ps1\` | \`powershell -ExecutionPolicy Bypass -File .\\install.ps1\` |
| Windows on ARM | \`${pkg}-windows-arm64.zip\`, \`install.ps1\` | same |
| Linux | the matching \`${pkg}-linux-*.tar.gz\`, \`install.sh\` | \`sh install.sh\` |

The installer picks the right build for the processor (the "baseline" archive is for older processors without AVX2), installs the \`${pkg}\` command for the current user without administrator rights, and prints the version. \`INSTALL.md\` has the details. Afterwards \`${pkg} --version\` should print \`${version}\`.

**This repository is private**, so downloads need a signed-in browser, or on a machine without one: \`gh release download ${tag} --repo ${repo}\`.

## Know before you install

- **The programs are not code-signed.** The installers clear the "downloaded from the internet" mark that would otherwise make macOS Gatekeeper or Windows SmartScreen refuse to run them. Only install from this release; for a company-wide rollout, sign the binaries and use device management instead.
- **\`install.ps1\` was generated on a Mac and has not been run on Windows** by the people who built it. If it misbehaves, unzip the archive and put \`${pkg}.exe\` anywhere on your PATH; that is all the script does.
- Verify a download against \`SHA256SUMS\`: \`shasum -a 256 -c SHA256SUMS\` (macOS, Linux) or \`Get-FileHash <file> -Algorithm SHA256\` (Windows).
- Updating means installing a newer release over the old one. This is the terminal version; the desktop app is packaged separately.
`
}

function desktopNotes(brand: Brand, version: string, repo: string, tag: string): string {
  const name = brand.productName
  const file = (platform: "darwin" | "win32", arch: "arm64" | "x64") => desktopArtifactName(brand, { platform, arch })
  return `The **${name} ${brand.tagline}** ${version} desktop app: the graphical version, for Mac and Windows.

Rebranded from [OpenCode v${version}](https://github.com/${brand.upstreamRepo}/releases/tag/v${version}) (MIT licensed; \`LICENSE\` is attached).

## Install

Download **the installer for your machine plus the helper script** into one folder, then:

| Machine | Download | Run |
|---|---|---|
| Mac, Apple Silicon (M1 and later) | \`${file("darwin", "arm64")}\`, \`install-mac.sh\` | \`sh install-mac.sh\` |
| Mac, Intel | \`${file("darwin", "x64")}\`, \`install-mac.sh\` | \`sh install-mac.sh\` |
| Windows, Intel or AMD | \`${file("win32", "x64")}\`, \`install-windows.ps1\` | \`powershell -ExecutionPolicy Bypass -File .\\install-windows.ps1\` |
| Windows on ARM | \`${file("win32", "arm64")}\`, \`install-windows.ps1\` | same |

\`INSTALL.md\` has the details.

**This repository is private**, so downloads need a signed-in browser, or on a machine without one: \`gh release download ${tag} --repo ${repo}\`.

## Know before you install

- **These builds are not signed** by Apple or Microsoft. On a Mac, use the script rather than double-clicking the zip: a downloaded copy unpacked by hand is refused with "${name} is damaged" or "Apple could not verify". On Windows, double-clicking the setup file shows a SmartScreen warning (More info, then Run anyway); the script avoids it. Only install from this release; for a company-wide rollout, sign the builds and use device management instead.
- **The Windows app was built on a Mac and has not been run on Windows** by the people who built it. It was checked for processor type, name, publisher and the Windows terminal component. Treat the first install as the real test.
- **The app does not update itself.** Upstream's updater is switched off because it would replace ${name} with stock OpenCode. Updating means installing a newer release over the old one.
- Verify a download against \`SHA256SUMS\`: \`shasum -a 256 -c SHA256SUMS\` (macOS) or \`Get-FileHash <file> -Algorithm SHA256\` (Windows).
- The terminal version is a separate release. Both share one configuration file.
`
}

function teamNotes(brand: Brand, version: string, repo: string, tag: string): string {
  const name = brand.productName
  return `**For administrators.** The company-controlled configuration for **${name} ${brand.tagline}**, as of ${version}: the enforced settings and the shared team folder. Install it once per machine; developers cannot change it and their home folders are never touched.

## Files

| File | What it is |
|---|---|
| \`simplify-code.jsonc\` | Enforced config: company gateway, allowed models, sharing off, self-update off, required plugins |
| \`team.zip\` | Shared folder: agents, commands, skills and local plugins with their dependencies |
| \`install-team.sh\`, \`install-team.ps1\` | Installers for macOS/Linux and Windows |
| \`INSTALL.md\` | Details, including how to check a machine |

## Install or update

macOS and Linux, in the folder holding all four files:

\`\`\`bash
sudo sh install-team.sh
\`\`\`

Windows, in an elevated PowerShell:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\\install-team.ps1
\`\`\`

Add \`--plugin-lock\` (or \`-PluginLock\`) to create the \`plugin-lock\` marker: ${name} then ignores any plugin an administrator did not declare. Re-running updates everything and replaces the team folder wholesale.

**This repository is private**: \`gh release download ${tag} --repo ${repo}\`.

## Before the first deployment

- \`simplify-code.jsonc\` still has the **placeholder** gateway address. Set the real one and run \`bun run script/check-managed.ts\` in the overlay repo until it prints \`ok, deployable\`.
- Each developer needs their own gateway key at \`~/.config/simplifyx/gateway-key\`.
- Machines must reach github.com and npmjs.org on first launch: the app installs the required plugins from there.
- This works with any ${name} build from the same date onward. It is independent of the app version.
`
}
